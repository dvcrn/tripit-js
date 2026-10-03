// Serializes read/replace operations across clients in this process.
const locks = new Map<string, Promise<unknown>>();

export async function withObjectLock<T>(
	key: string,
	fn: () => Promise<T>,
): Promise<T> {
	const previous = locks.get(key) ?? Promise.resolve();
	const run = previous.catch(() => undefined).then(fn);
	const settled = run.catch(() => undefined);
	locks.set(key, settled);
	try {
		return await run;
	} finally {
		if (locks.get(key) === settled) locks.delete(key);
	}
}
