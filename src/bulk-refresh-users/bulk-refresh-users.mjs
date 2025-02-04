// ==== Adjust the values below to configure the script ====

// 1. Set this to your instance URL.
const instance = 'https://example.com';

// 2. Set this to a moderator's native token.
// An access token may work, but has not been tested.
const token = '';

// 3. (optional) Set API options to filter the list of users.
// You can supply any supported parameter to the /api/admin/show-users endpoint, but please do not include "limit", "offset", or "origin".
// Those values are generated by the script and will cause errors if modified.
const usersFilter = {
	sort: '-createdAt',
	state: 'available',
};

// 4. (optional) Set minimum time in milliseconds between requests to update a user.
// The current Sharkey release supports a maximum of 2 calls per second (500 ms) with default rate limits.
// This can be increased to slow down the process, and therefore reduce server load.
const requestIntervalMs = 500;

// 5. (optional) Resume an earlier failed run.
// If the script exited early (such as from network trouble), then you can resume where you left off by adjusting this value.
// Scroll back up in the previous output to the last instance of "Updating page from offset ####:" and place that number here.
// The script will resume from that point.
const initialOffset = 0;

// ==== Stop here! Don't touch anything else! ====

try {
	for (let offset = initialOffset;;) {
		console.log(`Updating page from offset ${offset}:`);
		const page = await api('admin/show-users', {
			offset,
			limit: 100,
			origin: 'remote',
			...usersFilter
		});

		// Stop looping when we stop getting results
		if (page.length < 1) break;
		offset += page.length;

		// Process the page at the configured rate
		await updateUsersAtRate(page);
	}
} catch (err) {
	console.error('Failed with unhandled error: ', err);
}

/**
 * @typedef User
 * @property {string} id
 * @property {string} host
 * @property {string} username
 */

/**
 * Drip-feeds background requests to update users from a list.
 * Maintains an average of requestIntervalMs milliseconds between calls.
 * @param page {User[]}
 * @returns {Promise<void>}
 */
function updateUsersAtRate(page) {
	return new Promise((resolve, reject) => {
		const interval = setInterval(async () => {
			try {
				const res = await updateNextUser(page);
				if (!res) {
					clearInterval(interval);
					resolve();
				}
			} catch (err) {
				reject(err);
			}
		}, requestIntervalMs);
	});
}

/**
 * @param {User[]} page
 * @returns {Promise<boolean>}
 */
async function updateNextUser(page) {
	const user = page.shift();
	if (!user) return false;

	await api('federation/update-remote-user', { userId: user.id })
		.then(() => console.log(`Successfully updated user ${user.id} (${user.username}@${user.host})`))
		.catch(err => console.log(`Failed to update user ${user.id} (${user.username}@${user.host}):`, err))
	;
	return true;
}

/**
 * Makes a POST request to Sharkey's API with automatic credentials and rate limit support.
 * @param {string} endpoint API endpoint to call
 * @param {unknown} [body] Optional object to send as API request payload
 * @param {boolean} [retry] Do not use - for retry purposes only
 * @returns {Promise<unknown>}
 */
async function api(endpoint, body = {}, retry = false) {
	try {
		const res = await fetch(`${instance}/api/${endpoint}`, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});

		// Check for rate limit
		if (res.status === 429 && !retry) {
			const reset = res.headers.get('X-RateLimit-Reset');
			const delay = reset ? Number.parseFloat(reset) : 1;
			await new Promise(resolve => setTimeout(resolve, delay * 1000));
			return await api(endpoint, body, true);
		}

		// Fucky way of handling any possible response through one code path
		if (res.ok) {
			const contentType = res.headers.get('Content-Type');
			if (!contentType) return undefined;
			if (contentType.startsWith('application/json')) return await res.json();
			if (contentType.startsWith('text/')) return await res.text();
			throw `Unsupported Content-Type: ${contentType}`
		} else {
			throw `${res.status} ${res.statusText}`;
		}
	} catch (err) {
		throw String(err);
	}
}