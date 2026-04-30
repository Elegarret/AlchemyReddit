const loadImage = async (objectUrl: string) =>
  await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image.'));
    image.src = objectUrl;
  });

const normalizeImageFile = async (
  file: File,
  options: {
    height: number;
    mode: 'contain' | 'cover';
    width: number;
  }
) => {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = options.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas rendering is unavailable.');
    }

    context.clearRect(0, 0, options.width, options.height);
    const scale =
      options.mode === 'cover'
        ? Math.max(options.width / image.width, options.height / image.height)
        : Math.min(options.width / image.width, options.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (options.width - width) / 2;
    const y = (options.height - height) / 2;
    context.drawImage(image, x, y, width, height);

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const normalizeElementIconFile = async (file: File) =>
  await normalizeImageFile(file, {
    height: 256,
    mode: 'contain',
    width: 256,
  });

export const normalizeRealmCoverFile = async (file: File) =>
  await normalizeImageFile(file, {
    height: 720,
    mode: 'cover',
    width: 1280,
  });
