import {strToU8, zipSync} from 'fflate';

export function downloadFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  try {
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function downloadZippedText(archiveName, entryName, text) {
  const bytes = zipSync({[entryName]: strToU8(text)}, {level: 0});
  downloadFile(archiveName, new Blob([bytes], {type: 'application/zip'}));
}
