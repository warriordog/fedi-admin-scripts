// Warning: this may contain Akkoma-specific properties.
export interface PleromaInstance {
    version: string;
    description: string;
    title: string;
    stats: {
        domain_count: number;
        remote_user_count: number;
        status_count: number;
        user_count: number;
    },
    uri: string;
    pleroma: {
        metadata: {
            features: string[];
            account_activation_required: boolean;
            privileged_staff: boolean;
            federation: {
                enabled: boolean;
                mrf_simple: Record<string, unknown>;
                mrf_hashtag: Record<string, unknown>;
                mrf_object_age: Record<string, unknown>;
                quarantined_instances: string[];
                quarantined_instances_info: {
                    quarantined_instances: Record<string, string>;
                },
                exclusions: boolean;
                mrf_policies: string[];
                mrf_simple_info: Record<string, unknown>;
            },
            fields_limits: {
                max_fields: number;
                max_remote_fields: number;
                name_length: number;
                value_length: number;
            },
            post_formats: string[];
        },
        stats: {
            mau: number;
        },
        vapid_public_key: string;
    },
    email: string;
    background_image: string;
    description_limit: number;
    upload_limit: number;
    avatar_upload_limit: number;
    background_upload_limit: number;
    banner_upload_limit: number;
    languages: string[];
    poll_limits: {
        max_options: number;
        max_option_chars: number;
        min_expiration: number;
        max_expiration: number;
    },
    max_toot_chars: number;
    approval_required: boolean;
    registrations: boolean;
    thumbnail: string;
    urls: {
        streaming_api: string;
    }
}
