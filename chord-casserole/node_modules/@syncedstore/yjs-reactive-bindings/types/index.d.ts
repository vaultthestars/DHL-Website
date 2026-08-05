import * as Y from "yjs";
export declare function isYType(element: any): any;
export declare function observeYJS(element: Y.AbstractType<any> | Y.Doc): Y.AbstractType<any> | Y.Doc;
export declare function makeYDocObservable(doc: Y.Doc): void;
export { enableMobxBindings, enableReactiveBindings, enableVueBindings } from "./observableProvider";
