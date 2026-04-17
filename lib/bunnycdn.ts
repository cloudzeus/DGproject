import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const bunnyApi = axios.create({
  baseURL: 'https://api.bunnycdn.com',
  headers: {
    'AccessKey': process.env.BUNNY_ACCESS_KEY,
  },
});

const storageApi = axios.create({
  baseURL: `https://${process.env.BUNNY_STORAGE_API_HOST}`,
  headers: {
    'AccessKey': process.env.BUNNY_ACCESS_KEY,
  },
});

export interface UploadOptions {
  file: Buffer | fs.ReadStream;
  filename: string;
  folder?: string;
  contentType?: string;
}

export interface BunnyCDNFile {
  url: string;
  path: string;
  size: number;
  lastModified: Date;
}

/**
 * Upload a file to BunnyCDN storage
 */
export async function uploadFileToCDN(options: UploadOptions): Promise<BunnyCDNFile> {
  try {
    const { file, filename, folder = '', contentType = 'application/octet-stream' } = options;

    const uploadPath = folder ? `${folder}/${filename}` : filename;

    let fileData: Buffer;
    if (Buffer.isBuffer(file)) {
      fileData = file;
    } else if (file instanceof fs.ReadStream) {
      fileData = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        file.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        file.on('end', () => resolve(Buffer.concat(chunks)));
        file.on('error', reject);
      });
    } else {
      throw new Error('Invalid file type');
    }

    const response = await storageApi.put(
      `/${process.env.BUNNY_STORAGE_ZONE}/${uploadPath}`,
      fileData,
      {
        headers: {
          'Content-Type': contentType,
        },
      }
    );

    const cdnUrl = `https://${process.env.BUNNY_CDN_HOSTNAME}/${uploadPath}`;

    console.log('✅ File uploaded to CDN:', cdnUrl);

    return {
      url: cdnUrl,
      path: uploadPath,
      size: fileData.length,
      lastModified: new Date(),
    };
  } catch (error) {
    console.error('❌ Failed to upload file to CDN:', error);
    throw error;
  }
}

/**
 * Delete a file from BunnyCDN storage
 */
export async function deleteFileFromCDN(filePath: string): Promise<boolean> {
  try {
    await storageApi.delete(
      `/${process.env.BUNNY_STORAGE_ZONE}/${filePath}`
    );

    console.log('✅ File deleted from CDN:', filePath);
    return true;
  } catch (error) {
    console.error('❌ Failed to delete file from CDN:', error);
    throw error;
  }
}

/**
 * Get CDN URL for a file
 */
export function getCDNUrl(filePath: string): string {
  return `https://${process.env.BUNNY_CDN_HOSTNAME}/${filePath}`;
}

/**
 * Get file info from BunnyCDN
 */
export async function getFileInfo(filePath: string): Promise<BunnyCDNFile | null> {
  try {
    const response = await storageApi.get(
      `/${process.env.BUNNY_STORAGE_ZONE}/${filePath}`
    );

    if (response.status === 200) {
      return {
        url: getCDNUrl(filePath),
        path: filePath,
        size: response.data.length || 0,
        lastModified: new Date(response.headers['last-modified'] || new Date()),
      };
    }

    return null;
  } catch (error) {
    console.error('❌ Failed to get file info:', error);
    return null;
  }
}

/**
 * Create a pull zone (CDN distribution)
 */
export async function createPullZone(
  name: string,
  originUrl: string
) {
  try {
    const response = await bunnyApi.post('/pullzone', {
      Name: name,
      OriginUrl: originUrl,
      CacheTtl: 3600,
      CacheControlMaxAgeOverride: 3600,
    });

    console.log('✅ Pull zone created:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to create pull zone:', error);
    throw error;
  }
}

/**
 * Purge BunnyCDN cache for a file
 */
export async function purgeCDNCache(filePath: string): Promise<boolean> {
  try {
    await bunnyApi.post('/purgeCache', {
      url: getCDNUrl(filePath),
    });

    console.log('✅ CDN cache purged:', filePath);
    return true;
  } catch (error) {
    console.error('❌ Failed to purge CDN cache:', error);
    return false;
  }
}
