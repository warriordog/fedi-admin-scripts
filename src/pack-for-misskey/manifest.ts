export interface Manifest {
    [packName: string]: Pack;
}
export interface Pack {
    description: string;
    files: string;
    homepage?: string;
    src: string;
    src_sha256?: string;
    license?: string;
}