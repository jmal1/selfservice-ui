import { describe, expect, it } from 'vitest';
import {
	BARE_OVF_REJECTED,
	IMAGE_TOO_LARGE,
	MAX_IMAGE_UPLOAD_BYTES,
	UNSUPPORTED_IMAGE_TYPE,
	imageStatusNeedsPoll,
	rejectImageFile,
	uploadProgressPercent
} from './library';

describe('imageStatusNeedsPoll', () => {
	it('keeps polling through uploaded until the worker finishes import', () => {
		expect(imageStatusNeedsPoll('pending')).toBe(true);
		expect(imageStatusNeedsPoll('uploading')).toBe(true);
		expect(imageStatusNeedsPoll('uploaded')).toBe(true);
		expect(imageStatusNeedsPoll('importing')).toBe(true);
		expect(imageStatusNeedsPoll('imported')).toBe(false);
		expect(imageStatusNeedsPoll('error')).toBe(false);
	});
});

describe('uploadProgressPercent', () => {
	it('tracks bytes sent and clamps the ends', () => {
		expect(uploadProgressPercent(0, 1000)).toBe(0);
		expect(uploadProgressPercent(250, 1000)).toBe(25);
		expect(uploadProgressPercent(1000, 1000)).toBe(100);
		expect(uploadProgressPercent(1500, 1000)).toBe(100);
		expect(uploadProgressPercent(10, 0)).toBe(0);
	});
});

describe('rejectImageFile', () => {
	it('rejects a bare .ovf with packing guidance', () => {
		expect(rejectImageFile('appliance.ovf', 1024)).toBe(BARE_OVF_REJECTED);
	});

	it('accepts .iso and .ova under the 16 GiB cap', () => {
		expect(rejectImageFile('disk.iso', 1024)).toBeNull();
		expect(rejectImageFile('lab.ova', MAX_IMAGE_UPLOAD_BYTES)).toBeNull();
	});

	it('rejects other extensions and oversized files', () => {
		expect(rejectImageFile('lab.zip', 1024)).toBe(UNSUPPORTED_IMAGE_TYPE);
		expect(rejectImageFile('lab.ova', MAX_IMAGE_UPLOAD_BYTES + 1)).toBe(IMAGE_TOO_LARGE);
	});
});
