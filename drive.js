// drive.js — auth + Google Drive helpers

const CLIENT_ID = "314049507451-oofo1sdelr7knosuu975ad6c27o8f1dk.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const MIME = "application/json; charset=UTF-8";

let accessToken = null;
let tokenClient = null;
let gotConsentOnce = false;

export function isSignedIn() { return Boolean(accessToken); }
export function getAccessToken() { return accessToken; }

export async function signIn() {
	return new Promise((resolve, reject) => {
		try {
			if (!tokenClient) {
				tokenClient = google.accounts.oauth2.initTokenClient({
					client_id: CLIENT_ID,
					scope: SCOPE,
					callback: (tokResp) => {
						accessToken = tokResp.access_token;
						window.dispatchEvent(new CustomEvent("drive:signed-in"));
						resolve(accessToken);
					},
					error_callback: (err) => {
						accessToken = null;
						window.dispatchEvent(new CustomEvent("drive:sign-in-error", { detail: err }));
						reject(err);
					},
				});
			}
			tokenClient.requestAccessToken({ prompt: gotConsentOnce ? "" : "consent" });
			gotConsentOnce = true;
		} catch (e) { reject(e); }
	});
}

// Expose GIS callback used by data-callback="onSignIn"
window.onSignIn = () => { signIn().catch(() => { }); };

// ---- Drive REST helpers ----
async function driveFetch(url, options = {}) {
	if (!accessToken) throw new Error("No access token");
	const res = await fetch(url, {
		...options,
		headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
	});
	if (!res.ok) {
		const msg = await res.text().catch(() => res.statusText);
		throw new Error(`${res.status} ${res.statusText}: ${msg}`);
	}
	return res;
}

export async function findFileByName(name) {
	const q = encodeURIComponent(`name='${name}' and trashed=false`);
	const fields = encodeURIComponent("files(id,name,webViewLink,modifiedTime,size)");
	const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&spaces=drive`);
	const data = await res.json();
	return data.files?.[0] || null;
}

function buildMultipart(parts) {
	const boundary = "-------314159265358979323846";
	const crlf = "\r\n";
	let data = "";
	for (const p of parts) data += `--${boundary}${crlf}Content-Type: ${p.type}${crlf}${crlf}${p.data}${crlf}`;
	data += `--${boundary}--${crlf}`;
	return { data, contentType: `multipart/related; boundary=${boundary}` };
}

export async function createJsonFile(name, initial = []) {
	const metadata = { name, mimeType: "application/json" };
	const body = buildMultipart([
		{ type: "application/json; charset=UTF-8", data: JSON.stringify(metadata) },
		{ type: MIME, data: JSON.stringify(initial, null, 2) }
	]);
	const res = await driveFetch(
		"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime,size",
		{ method: "POST", headers: { "Content-Type": body.contentType }, body: body.data }
	);
	return res.json();
}

export async function getFileContent(id) {
	const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
	return res.text();
}

export async function saveFileContent(id, text) {
	const res = await driveFetch(
		`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,
		{ method: "PATCH", headers: { "Content-Type": MIME }, body: text }
	);
	return res.json();
}
