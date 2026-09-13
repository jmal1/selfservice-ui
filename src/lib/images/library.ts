/**
 * Instructor image-library helpers (ISO/OVA upload page).
 *
 * Size cap matches MaxImageUploadBytes in selfservice-api (16 GiB).
 */

import type { ImageUploadStatus } from '$lib/types';

/** Same ceiling as MaxImageUploadBytes (16 GiB). JS `16 << 30` overflows 32-bit. */
export const MAX_IMAGE_UPLOAD_BYTES = 16 * 1024 * 1024 * 1024;

const NON_TERMINAL_IMAGE_STATUSES = new Set<ImageUploadStatus>([
	'pending',
	'uploading',
	'uploaded',
	'importing'
]);

export function imageStatusNeedsPoll(status: string): boolean {
	return NON_TERMINAL_IMAGE_STATUSES.has(status as ImageUploadStatus);
}

export const BARE_OVF_REJECTED =
	'Pack the OVF folder into a single .ova (tar of .ovf + disks) and upload that.';

export const UNSUPPORTED_IMAGE_TYPE = 'Only .iso and .ova are accepted';

export const IMAGE_TOO_LARGE =
	'File is larger than 16 GiB. Split or shrink it before uploading.';

export function rejectImageFile(filename: string, sizeBytes: number): string | null {
	if (sizeBytes > MAX_IMAGE_UPLOAD_BYTES) {
		return IMAGE_TOO_LARGE;
	}
	const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
	if (ext === '.ovf') {
		return BARE_OVF_REJECTED;
	}
	if (ext !== '.iso' && ext !== '.ova') {
		return UNSUPPORTED_IMAGE_TYPE;
	}
	return null;
}
