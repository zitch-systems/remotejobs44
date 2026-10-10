// Profile writes go through the web API, not straight to the database (which
// only lets the app update `name`). These tests pin the request shapes the
// server validates, the error text the user sees, and the cleanup paths.
const mockGetSession = jest.fn();
const mockStorageUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockStorageRemove = jest.fn();
const mockApiFetch = jest.fn();
const mockFileUpload = jest.fn();
let mockFileSize = 1024;

jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    storage: {
      // A plain function: resetAllMocks() in beforeEach would strip a jest.fn() implementation.
      from: () => ({
        upload: (...args: unknown[]) => mockStorageUpload(...args),
        getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
        remove: (...args: unknown[]) => mockStorageRemove(...args),
      }),
    },
  },
}));
jest.mock('./api', () => ({ ...jest.requireActual('./api'), apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));
jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get size() {
      return mockFileSize;
    }
    arrayBuffer = async () => new ArrayBuffer(8);
    upload = (...args: unknown[]) => mockFileUpload(this.uri, ...args);
  },
}));

import { ApiError } from './api';
import { cvMimeType, saveDetails, savePreferences, uploadAvatar, uploadCv } from './profile-api';

const response = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(() => {
  jest.resetAllMocks();
  mockFileSize = 1024;
  mockApiFetch.mockResolvedValue(response(200, { profile: {} }));
});

describe('savePreferences', () => {
  it('PATCHes skills and target role to the profile API', async () => {
    await savePreferences('user-1', { skills: ['React', 'Node'], targetRole: 'Engineer', headline: null });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/api/profile');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ skills: ['React', 'Node'], target_role: 'Engineer' });
  });

  it('does not wipe a headline when none is supplied, but sends one that is', async () => {
    await savePreferences('user-1', { skills: [], targetRole: null, headline: null });
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).not.toHaveProperty('headline');

    await savePreferences('user-1', { skills: [], targetRole: null, headline: 'Senior engineer' });
    expect(JSON.parse(mockApiFetch.mock.calls[1][1].body)).toMatchObject({ headline: 'Senior engineer', target_role: null });
  });

  it('shows the server’s validation message when it refuses the request', async () => {
    mockApiFetch.mockResolvedValueOnce(response(400, { error: 'Too many skills (max 50)' }));
    await expect(savePreferences('user-1', { skills: [], targetRole: null, headline: null }))
      .rejects.toMatchObject({ name: 'ApiError', status: 400, message: 'Too many skills (max 50)' });
  });

  it('hides server error detail and asks to sign in again on a 401', async () => {
    mockApiFetch.mockResolvedValueOnce(response(500, { error: 'duplicate key value violates unique constraint' }));
    await expect(savePreferences('user-1', { skills: [], targetRole: null, headline: null }))
      .rejects.toThrow('Could not save your changes. Please try again.');

    mockApiFetch.mockResolvedValueOnce(response(401, { error: 'Unauthorized' }));
    await expect(savePreferences('user-1', { skills: [], targetRole: null, headline: null }))
      .rejects.toThrow('Please sign in again.');
  });
});

describe('saveDetails', () => {
  it('PATCHes bio, links and experience', async () => {
    const details = {
      bio: 'Hello',
      links: { github: 'https://github.com/octocat' },
      experience: [{ title: 'Dev', company: 'Acme', period: '2024' }],
    };
    await saveDetails('user-1', details);

    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/api/profile');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual(details);
  });
});

describe('uploadAvatar', () => {
  const avatarUrl = 'https://abc.supabase.co/storage/v1/object/public/avatars/user-1/avatar-1700000000000.png';
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageRemove.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: avatarUrl } });
  });
  afterEach(() => jest.restoreAllMocks());

  it('uploads into the user’s folder, then records the public URL through the API', async () => {
    const url = await uploadAvatar('user-1', { uri: 'file:///cache/me.png', name: 'me.PNG', mimeType: 'image/png' });

    expect(url).toBe(avatarUrl);
    expect(mockStorageUpload).toHaveBeenCalledWith(
      'user-1/avatar-1700000000000.png',
      expect.any(ArrayBuffer),
      { contentType: 'image/png', upsert: true },
    );
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ avatar_url: avatarUrl });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('removes the uploaded photo when the profile update is refused', async () => {
    mockApiFetch.mockResolvedValueOnce(response(400, { error: 'Profile photo must be one you uploaded to your account' }));

    await expect(uploadAvatar('user-1', { uri: 'file:///cache/me.png', name: 'me.png' }))
      .rejects.toThrow('Profile photo must be one you uploaded');
    expect(mockStorageRemove).toHaveBeenCalledWith(['user-1/avatar-1700000000000.png']);
  });

  it('still reports the original failure if cleanup itself throws', async () => {
    mockApiFetch.mockResolvedValueOnce(response(500));
    mockStorageRemove.mockRejectedValueOnce(new Error('offline'));
    await expect(uploadAvatar('user-1', { uri: 'file:///cache/me.png', name: 'me.png' }))
      .rejects.toThrow('Could not save your changes. Please try again.');
  });

  it('does not call the API when the storage upload fails', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: new Error('bucket unavailable') });
    await expect(uploadAvatar('user-1', { uri: 'file:///cache/me.png', name: 'me.png' })).rejects.toThrow('bucket unavailable');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('refuses an oversized photo before uploading anything', async () => {
    mockFileSize = 6 * 1024 * 1024;
    await expect(uploadAvatar('user-1', { uri: 'file:///cache/big.png', name: 'big.png' }))
      .rejects.toMatchObject({ status: 400, message: 'Please choose a photo under 5 MB.' });
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });
});

describe('cvMimeType', () => {
  it('trusts the picker’s type when it is one the server accepts', () => {
    expect(cvMimeType({ name: 'cv.bin', mimeType: 'application/pdf' })).toBe('application/pdf');
    expect(cvMimeType({ name: 'cv', mimeType: 'APPLICATION/MSWORD' })).toBe('application/msword');
  });

  it('falls back to the extension when the provider reports a generic type', () => {
    expect(cvMimeType({ name: 'My CV.PDF', mimeType: 'application/octet-stream' })).toBe('application/pdf');
    expect(cvMimeType({ name: 'resume.docx', mimeType: null })).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(cvMimeType({ name: 'old.doc' })).toBe('application/msword');
  });

  it('returns null for anything else', () => {
    expect(cvMimeType({ name: 'photo.png', mimeType: 'image/png' })).toBeNull();
    expect(cvMimeType({ name: 'notes.txt', mimeType: 'text/plain' })).toBeNull();
    expect(cvMimeType({ name: 'noextension' })).toBeNull();
  });
});

describe('uploadCv', () => {
  const asset = { uri: 'file:///cache/cv.pdf', name: 'cv.pdf', mimeType: 'application/pdf' };
  const signedIn = () => mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-abc' } } });
  const reply = (status: number, body: unknown) => mockFileUpload.mockResolvedValue({ status, body: typeof body === 'string' ? body : JSON.stringify(body), headers: {} });

  it('uploads multipart to /api/cv with the bearer token and returns the signed URL', async () => {
    signedIn();
    reply(200, { success: true, url: 'https://signed.example/cv.pdf?t=1', path: 'user-1/cv.pdf' });

    await expect(uploadCv('user-1', asset)).resolves.toBe('https://signed.example/cv.pdf?t=1');

    expect(mockFileUpload).toHaveBeenCalledTimes(1);
    const [uri, url, options] = mockFileUpload.mock.calls[0];
    expect(uri).toBe('file:///cache/cv.pdf');
    expect(url).toBe('https://remotejobs44.com/api/cv');
    expect(options).toMatchObject({
      httpMethod: 'POST',
      uploadType: 1, // UploadType.MULTIPART
      fieldName: 'cv', // the field /api/cv reads
      mimeType: 'application/pdf',
      headers: { Authorization: 'Bearer jwt-abc', Accept: 'application/json' },
      sessionType: 'foreground',
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(mockApiFetch).not.toHaveBeenCalled(); // not through the 15 s JSON helper
  });

  it('infers the type from the extension when the picker gives a generic one', async () => {
    signedIn();
    reply(200, { url: 'https://signed.example/x' });
    await uploadCv('user-1', { uri: 'file:///cache/cv.docx', name: 'cv.docx', mimeType: 'application/octet-stream' });
    expect(mockFileUpload.mock.calls[0][2].mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('tells a free user the server’s Pro message', async () => {
    signedIn();
    reply(403, { error: 'CV upload is a Pro feature. Upgrade your plan to upload.' });
    await expect(uploadCv('user-1', asset)).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'CV upload is a Pro feature. Upgrade your plan to upload.',
    });
  });

  it('shows the rate-limit and validation messages, but a generic one for server errors', async () => {
    signedIn();
    reply(429, { error: 'Too many uploads. Try again later.' });
    await expect(uploadCv('user-1', asset)).rejects.toThrow('Too many uploads. Try again later.');

    reply(400, { error: 'File contents don’t match the file type. Please upload a real PDF or Word document.' });
    await expect(uploadCv('user-1', asset)).rejects.toThrow('don’t match the file type');

    reply(500, { error: 'storage bucket detail' });
    await expect(uploadCv('user-1', asset)).rejects.toThrow('Upload failed. Please try again.');

    reply(502, '<html>Bad gateway</html>');
    await expect(uploadCv('user-1', asset)).rejects.toThrow('Upload failed. Please try again.');
  });

  it('asks the user to sign in again, without uploading, when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(uploadCv('user-1', asset)).rejects.toMatchObject({ status: 401, message: 'Please sign in again.' });
    expect(mockFileUpload).not.toHaveBeenCalled();
  });

  it('rejects documents the server would refuse, before touching the network', async () => {
    await expect(uploadCv('user-1', { uri: 'file:///cache/me.png', name: 'me.png', mimeType: 'image/png' }))
      .rejects.toMatchObject({ status: 400, message: 'Please choose a PDF or Word document.' });

    mockFileSize = 6 * 1024 * 1024;
    await expect(uploadCv('user-1', asset)).rejects.toMatchObject({ status: 400, message: 'File too large (max 5MB).' });

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockFileUpload).not.toHaveBeenCalled();
  });

  it('turns a transport failure into a plain message', async () => {
    signedIn();
    mockFileUpload.mockRejectedValue(new Error('NSURLErrorDomain -1009'));
    const failure = uploadCv('user-1', asset);
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toThrow('Could not upload your CV. Check your connection and try again.');
  });

  it('resolves with an empty string if the server omits the URL', async () => {
    signedIn();
    reply(200, { success: true });
    await expect(uploadCv('user-1', asset)).resolves.toBe('');
  });
});
