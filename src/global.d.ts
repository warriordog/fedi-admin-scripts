// Fix weird TS errors around fetch:
// https://stackoverflow.com/a/75676044

import * as undici_types from 'undici-types';

declare global {
    export const {
        fetch,
        FormData,
        Headers,
        Request,
        Response,
    }: typeof import('undici-types');

    type FormData = undici_types.FormData;
    type Headers = undici_types.Headers;
    type HeadersInit = undici_types.HeadersInit;
    type BodyInit = undici_types.BodyInit;
    type Request = undici_types.Request;
    type RequestInit = undici_types.RequestInit;
    type RequestInfo = undici_types.RequestInfo;
    type RequestMode = undici_types.RequestMode;
    type RequestRedirect = undici_types.RequestRedirect;
    type RequestCredentials = undici_types.RequestCredentials;
    type RequestDestination = undici_types.RequestDestination;
    type ReferrerPolicy = undici_types.ReferrerPolicy;
    type Response = undici_types.Response;
    type ResponseInit = undici_types.ResponseInit;
    type ResponseType = undici_types.ResponseType;
}
