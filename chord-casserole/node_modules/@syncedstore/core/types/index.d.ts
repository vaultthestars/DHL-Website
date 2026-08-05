import * as Y from "yjs";
import { Array as SyncedArray, Doc as SyncedDoc, Map as SyncedMap, Text as SyncedText, XmlFragment as SyncedXml } from "yjs";
import { DocTypeDescription } from "./doc";
export { enableMobxBindings, enableVueBindings } from "@syncedstore/yjs-reactive-bindings";
export { Box, boxed } from "./boxed";
export * from "./util";
/**
 * @ignore
 */
export { Y };
/**
 * @ignore
 */
export { SyncedDoc, SyncedArray, SyncedMap, SyncedXml, SyncedText };
/**
 * @ignore
 */
export declare const INTERNAL_SYMBOL: unique symbol;
/**
 * Register a listener for when any changes to `object` or its nested objects occur.
 *
 * @param object the synced object (store, object, map, or Yjs value to observe)
 * @param handler the callback to be raised.
 * @returns a function to dispose (unregister) the handler
 */
export declare function observeDeep(object: any, handler: () => void): () => void;
/**
 * Access the internal Yjs Doc.
 *
 * @param store a store returned by
 * @returns the Yjs doc (Y.Doc) underneath.
 */
export declare function getYjsDoc<T>(store: T): Y.Doc;
/**
 * Access the internal Yjs value that backs the syncing of the passed in object.
 *
 * @param object a value retrieved from the store
 * @returns the Yjs value underneath. This can be a Y.Doc, Y.Array, Y.Map or other Y-type based on the value passed in
 */
export declare function getYjsValue(object: any): Y.Doc | Y.AbstractType<any> | undefined;
/**
 * Check whether two objects represent the same value.
 * A strict equality (===) check doesn't always work,
 * because SyncedStore can wrap the object with a Proxy depending on where you retrieved it.
 *
 * @param objectA Object to compare with objectB
 * @param objectB Object to compare with objectA
 * @returns true if they represent the same object, false otherwise
 */
export declare function areSame(objectA: any, objectB: any): boolean;
/**
 * Create a SyncedStore store
 * @param shape an object that describes the root types of the store. e.g.:
 *  const shape = {
 *    exampleArrayData: [],
 *    exampleObjectData: {},
 *    exampleXMLData: "xml",
 *    exampleTextData: "text",
 * };
 * @param doc (optional) a Y.Doc to use as the backing system
 * @returns a SyncedStore store
 */
export declare function syncedStore<T extends DocTypeDescription>(shape: T, doc?: Y.Doc): import("./doc").MappedTypeDescription<T>;
export default syncedStore;
