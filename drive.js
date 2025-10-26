// drive.js — Google sign-in + Drive REST. No UI.

(function () {
	const CLIENT_ID = "314049507451-oofo1sdelr7knosuu975ad6c27o8f1dk.apps.googleusercontent.com";
	const SCOPE = "https://www.googleapis.com/auth/drive.file";
	const MIME = "application/json; charset=UTF-8";

	let accessToken = null;
	let tokenClient = null;
	let gotConsentOnce = false;

	// --- OAuth via Google Identity Services ---
	window.onSignIn = async function onSignIn() {
		// identical flow to the working inline version
		tokenClient = google.accounts.oauth2.initTokenClient({
			client_id: CLIENT_ID,
			scope: SCOPE,
			callback: async (tokResp) => {
				accessToken = tokResp.access_token;
				try {
					if (typeof window.afterSignIn === "function") {
						await window.afterSignIn();
					}
				} catch { }
			},
			error_callback: (err) => {
				accessToken = null;
				if (typeof window.afterSignInError === "function") {
					window.afterSignInError(err);
				}
			},
		});
		tokenClient.requestAccessToken({ prompt: gotConsentOnce ? "" : "consent" });
		gotConsentOnce = true;
	};

	// --- Drive REST helpers ---
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

	async function findFileByName(name) {
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
		for (const p of parts) {
			data += `--${boundary}${crlf}`;
			data += `Content-Type: ${p.type}${crlf}${crlf}`;
			data += `${p.data}${crlf}`;
		}
		data += `--${boundary}--${crlf}`;
		return { data, contentType: `multipart/related; boundary=${boundary}` };
	}

	async function createJsonFile(name, initial = []) {
		const metadata = { name, mimeType: "application/json" };
		const body = buildMultipart([
			{ type: "application/json; charset=UTF-8", data: JSON.stringify(metadata) },
			{ type: MIME, data: JSON.stringify(initial, null, 2) },
		]);
		const res = await driveFetch(
			"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime,size",
			{ method: "POST", headers: { "Content-Type": body.contentType }, body: body.data }
		);
		return res.json();
	}

	async function getFileContent(id) {
		const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
		return res.text();
	}

	async function saveFileContent(id, text) {
		const res = await driveFetch(
			`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,
			{ method: "PATCH", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: text }
		);
		return res.json();
	}

	// expose a single namespace like before
	window.Drive = {
		findFileByName,
		createJsonFile,
		getFileContent,
		saveFileContent,
	};
})();
