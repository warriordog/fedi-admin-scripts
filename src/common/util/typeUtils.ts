/**
 * Like Partial<T>, but applies to only a subset of properties.
 * Keys that are assignable to TExclude will be made optional, and the rest will be left alone.
 */
export type SemiPartial<TObj, TExclude> =
    RequiredProperties<TObj, TExclude> &
    OptionalProperties<TObj, TExclude>;

type RequiredProperties<TObj, TExclude> = {
    [Key in Exclude<keyof TObj, TExclude>]: TObj[Key];
}

type OptionalProperties<TObj, TExclude> = {
    [Key in keyof TObj & TExclude]?: TObj[Key];
}
