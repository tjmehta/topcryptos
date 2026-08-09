// Several modules read required env vars at import time via `env-var`, so any
// test that touches them throws before a single assertion runs. Provide inert
// defaults here (setupFiles runs before the test module is loaded) without
// clobbering real values when they are present.
process.env.CACHE_STORE_DIR ||= './.cache'
process.env.CMC_API_KEY ||= 'test-cmc-api-key'
process.env.AWS_S3_ACCESS_KEY_ID ||= 'test-access-key-id'
process.env.AWS_S3_SECRET_ACCESS_KEY ||= 'test-secret-access-key'
process.env.AWS_S3_BUCKET ||= 'test-bucket'
process.env.AWS_S3_BUCKET_REGION ||= 'us-east-1'
