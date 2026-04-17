// ============================================================
// Wamanafo SHS Backend — File Storage Abstraction
// Set STORAGE_PROVIDER=s3|r2|stub in .env
// ============================================================

export interface StorageProvider {
  upload(key: string, body: Buffer | Uint8Array, contentType: string): Promise<string>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

class S3Provider implements StorageProvider {
  private bucket   = process.env.STORAGE_BUCKET ?? "";
  private region   = process.env.STORAGE_REGION ?? "us-east-1";
  private accessKey = process.env.STORAGE_ACCESS_KEY_ID ?? "";
  private secretKey = process.env.STORAGE_SECRET_ACCESS_KEY ?? "";
  private endpoint  = process.env.STORAGE_ENDPOINT;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async s3(): Promise<any> {
    const { S3Client } = await import("@aws-sdk/client-s3" as string) as any;
    return new S3Client({
      region: this.region,
      credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
      ...(this.endpoint ? { endpoint: this.endpoint } : {}),
    });
  }

  async upload(key: string, body: Buffer | Uint8Array, contentType: string): Promise<string> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3" as string) as any;
    await (await this.s3()).send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    return key;
  }

  async signedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3" as string) as any;
    const { getSignedUrl }     = await import("@aws-sdk/s3-request-presigner" as string) as any;
    return getSignedUrl(await this.s3(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3" as string) as any;
    await (await this.s3()).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

class StubProvider implements StorageProvider {
  async upload(key: string): Promise<string>                  { console.info(`[STORAGE STUB] upload: ${key}`); return key; }
  async signedUrl(key: string): Promise<string>               { return `/stub-storage/${key}`; }
  async delete(key: string): Promise<void>                    { console.info(`[STORAGE STUB] delete: ${key}`); }
}

export const storage: StorageProvider =
  (process.env.STORAGE_PROVIDER === "s3" || process.env.STORAGE_PROVIDER === "r2")
    ? new S3Provider()
    : new StubProvider();

export const schoolLogoKey = (schoolId: string, ext: string) => `schools/${schoolId}/logo.${ext}`;
export const importKey     = (schoolId: string, filename: string) => `schools/${schoolId}/imports/${Date.now()}-${filename}`;
