import imageCompression from 'browser-image-compression';

export async function compressImage(file: File, dataSaverEnabled: boolean): Promise<File> {
  if (!dataSaverEnabled || !file.type.startsWith('image/')) {
    return file;
  }

  const options = {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1024,
    useWebWorker: true,
  };

  try {
    const compressedFile = await imageCompression(file, options);
    return compressedFile;
  } catch (error) {
    console.error('Error compressing image:', error);
    return file; // Fallback to original file if compression fails
  }
}
