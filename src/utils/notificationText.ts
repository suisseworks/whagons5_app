export function getAttachmentTypeLabel(fileName: string, forcedImage = false): string {
  const normalizedName = (fileName || '').trim();
  const lowerName = normalizedName.toLowerCase();
  const extension = lowerName.includes('.') ? lowerName.split('.').pop() : '';

  if (forcedImage) {
    return 'Image attachment';
  }

  if (lowerName.includes('voice memo') || lowerName.includes('audio memo')) {
    return 'Audio attachment';
  }

  if (extension) {
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'tiff', 'svg'].includes(extension)) {
      return 'Image attachment';
    }
    if (extension === 'pdf') {
      return 'PDF attachment';
    }
    if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(extension)) {
      return 'Video attachment';
    }
    if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac'].includes(extension)) {
      return 'Audio attachment';
    }
    if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(extension)) {
      return 'Document attachment';
    }
    if (['xls', 'xlsx', 'csv'].includes(extension)) {
      return 'Spreadsheet attachment';
    }
    if (['ppt', 'pptx'].includes(extension)) {
      return 'Presentation attachment';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
      return 'Archive attachment';
    }
  }

  return 'File attachment';
}

const ATTACHMENT_MARKDOWN_LINK_RE = /(!?)\[([^\]]+)\]\(([^)]+)\)/g;

export function sanitizeNotificationMessage(rawMessage: string): string {
  if (!rawMessage) return '';

  return rawMessage.replace(
    ATTACHMENT_MARKDOWN_LINK_RE,
    (_match, isImageSyntax, fileName, link) => {
      if (!String(link).includes('convex-file:')) return _match;
      return getAttachmentTypeLabel(fileName, isImageSyntax === '!');
    },
  );
}
