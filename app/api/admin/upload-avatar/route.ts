import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (!file || !userId) {
      return NextResponse.json({ error: 'Missing file or userId' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${userId}-${Date.now()}.jpg`;
    const bunnyPath = `/avatars/${fileName}`;

    const response = await axios.put(
      `https://${process.env.BUNNY_STORAGE_ENDPOINT}${bunnyPath}`,
      buffer,
      {
        headers: {
          AccessKey: process.env.BUNNY_STORAGE_API_KEY,
          'Content-Type': 'image/jpeg',
        },
      }
    );

    const cdnUrl = `https://${process.env.BUNNY_PULL_ZONE_HOSTNAME}/avatars/${fileName}`;

    return NextResponse.json({ url: cdnUrl }, { status: 200 });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 });
  }
}
