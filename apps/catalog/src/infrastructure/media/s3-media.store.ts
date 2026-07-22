import { randomUUID } from 'crypto';
import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MediaStore } from '../../application/ports';

/**  Documentation §13 — minimal media seam (S3-compatible / MinIO locally) */
export class S3MediaStore implements MediaStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly expiresIn: number;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
    this.bucket = process.env.S3_BUCKET ?? 'food-ordering-media';
    this.publicBaseUrl = process.env.S3_PUBLIC_BASE_URL ?? endpoint;
    this.expiresIn = Number(process.env.S3_PRESIGN_EXPIRES_SECONDS ?? 900);

    this.client = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
      },
    });
  }

  async presignUpload(input: {
    productId: string;
    contentType: string;
    fileExtension: string;
  }): Promise<{ uploadUrl: string; publicUrl: string; objectKey: string; expiresIn: number }> {
    const ext = input.fileExtension.replace(/^\./, '') || 'jpg';
    const objectKey = `products/${input.productId}/${randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: input.contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.expiresIn,
    });
    const publicUrl = `${this.publicBaseUrl.replace(/\/$/, '')}/${this.bucket}/${objectKey}`;
    return {
      uploadUrl,
      publicUrl,
      objectKey,
      expiresIn: this.expiresIn,
    };
  }
}
