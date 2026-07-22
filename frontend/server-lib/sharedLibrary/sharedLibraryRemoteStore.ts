import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type RemoteJsonStore = {
  backend: "s3" | "blob";
  readJson: <T>(key: string) => Promise<T | null>;
  writeJson: (key: string, payload: unknown) => Promise<void>;
  listJsonKeys: (prefix: string) => Promise<Array<{ key: string; updatedAt: Date }>>;
};

const isVercelProduction = (): boolean => process.env.VERCEL === "1";

export const useS3Storage = (): boolean => {
  const override = process.env.SHARED_LIBRARY_STORAGE?.toLowerCase();
  if (override === "blob") {
    return false;
  }
  if (override === "s3" || override === "r2") {
    return Boolean(
      process.env.SHARED_LIBRARY_S3_BUCKET &&
        process.env.SHARED_LIBRARY_S3_ACCESS_KEY_ID &&
        process.env.SHARED_LIBRARY_S3_SECRET_ACCESS_KEY
    );
  }
  return Boolean(
    process.env.SHARED_LIBRARY_S3_BUCKET &&
      process.env.SHARED_LIBRARY_S3_ACCESS_KEY_ID &&
      process.env.SHARED_LIBRARY_S3_SECRET_ACCESS_KEY
  );
};

/** True when @vercel/blob can authenticate (static token or Vercel OIDC + store id). */
export const useBlobStorage = (): boolean => {
  const override = process.env.SHARED_LIBRARY_STORAGE?.toLowerCase();
  if (override === "s3" || override === "r2") {
    return false;
  }
  if (override === "blob") {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (isVercelProduction() && process.env.BLOB_STORE_ID));
  }
  if (useS3Storage()) {
    return false;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return true;
  }
  if (isVercelProduction() && process.env.BLOB_STORE_ID) {
    return true;
  }
  return false;
};

const streamToString = async (body: unknown): Promise<string> => {
  if (!body) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return new TextDecoder().decode(bytes);
  }
  const stream = body as AsyncIterable<Uint8Array>;
  if (stream && typeof stream[Symbol.asyncIterator] === "function") {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    if (chunks.length === 0) {
      return "";
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(merged);
  }
  return "";
};

let s3Client: S3Client | null = null;

const getS3Client = (): S3Client => {
  if (s3Client) {
    return s3Client;
  }
  const endpoint = process.env.SHARED_LIBRARY_S3_ENDPOINT;
  s3Client = new S3Client({
    region: process.env.SHARED_LIBRARY_S3_REGION ?? "auto",
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.SHARED_LIBRARY_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SHARED_LIBRARY_S3_SECRET_ACCESS_KEY!,
    },
  });
  return s3Client;
};

const createS3RemoteStore = (): RemoteJsonStore => {
  const bucket = process.env.SHARED_LIBRARY_S3_BUCKET!;

  return {
    backend: "s3",
    readJson: async <T>(key: string): Promise<T | null> => {
      try {
        const result = await getS3Client().send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        );
        const text = await streamToString(result.Body);
        if (!text) {
          return null;
        }
        return JSON.parse(text) as T;
      } catch {
        return null;
      }
    },
    writeJson: async (key: string, payload: unknown): Promise<void> => {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(payload),
          ContentType: "application/json",
        })
      );
    },
    listJsonKeys: async (prefix: string): Promise<Array<{ key: string; updatedAt: Date }>> => {
      const entries: Array<{ key: string; updatedAt: Date }> = [];
      let continuationToken: string | undefined;

      do {
        const result = await getS3Client().send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );
        (result.Contents ?? []).forEach((object) => {
          if (!object.Key) {
            return;
          }
          entries.push({
            key: object.Key,
            updatedAt: object.LastModified ?? new Date(0),
          });
        });
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (continuationToken);

      return entries;
    },
  };
};

const getBlobModule = async () => import("@vercel/blob");

const createBlobRemoteStore = (): RemoteJsonStore => ({
  backend: "blob",
  readJson: async <T>(key: string): Promise<T | null> => {
    const { get } = await getBlobModule();
    try {
      const result = await get(key, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return null;
      }
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  },
  writeJson: async (key: string, payload: unknown): Promise<void> => {
    const { put } = await getBlobModule();
    await put(key, JSON.stringify(payload), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  },
  listJsonKeys: async (prefix: string): Promise<Array<{ key: string; updatedAt: Date }>> => {
    const { list } = await getBlobModule();
    const { blobs } = await list({ prefix });
    return blobs.map((blob) => ({
      key: blob.pathname,
      updatedAt: blob.uploadedAt,
    }));
  },
});

export const getRemoteJsonStore = (): RemoteJsonStore | null => {
  if (useS3Storage()) {
    return createS3RemoteStore();
  }
  if (useBlobStorage()) {
    return createBlobRemoteStore();
  }
  return null;
};

export const isRemoteStorageConfigured = (): boolean => getRemoteJsonStore() !== null;
