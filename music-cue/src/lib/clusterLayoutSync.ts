import { isWebDeployment } from "./runtime";
import { ClusterCenterOverrides } from "./types";
import { normalizeClusterCenterOverrides } from "./storage";

export const syncClusterLayoutToServer = async (overrides: ClusterCenterOverrides): Promise<void> => {
  if (isWebDeployment) {
    return;
  }

  try {
    await fetch("/api/cluster-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    });
  } catch {
    // Local server may not be running during static preview.
  }
};

export const fetchClusterLayoutFromServer = async (): Promise<ClusterCenterOverrides | null> => {
  if (isWebDeployment) {
    return null;
  }

  try {
    const response = await fetch("/api/cluster-layout");
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as Partial<ClusterCenterOverrides>;
    return normalizeClusterCenterOverrides(payload);
  } catch {
    return null;
  }
};
