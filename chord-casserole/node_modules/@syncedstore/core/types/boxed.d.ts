import { JSONValue } from "./types";
/**
 * @ignore
 */
export declare class Box<T extends Readonly<JSONValue>> {
    readonly value: T;
    constructor(value: T);
}
export declare function boxed<T extends JSONValue>(value: T): Box<T>;
