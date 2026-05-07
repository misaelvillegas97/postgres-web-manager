import { PostgresPoolManager } from './postgres-pool.manager';

describe('PostgresPoolManager', () => {
  it('destroys a pool at most once when destroy calls race', async () => {
    const manager = new PostgresPoolManager();
    let releaseEnd: (() => void) | undefined;
    const end = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseEnd = resolve;
        }),
    );

    (
      manager as unknown as { pools: Map<string, { end: jest.Mock }> }
    ).pools.set('conn-1', {
      end,
    });

    const firstDestroy = manager.destroyPool('conn-1');
    const secondDestroy = manager.destroyPool('conn-1');

    await new Promise((resolve) => setImmediate(resolve));
    expect(end).toHaveBeenCalledTimes(1);
    releaseEnd?.();

    await expect(Promise.all([firstDestroy, secondDestroy])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(end).toHaveBeenCalledTimes(1);
    expect(manager.hasPool('conn-1')).toBe(false);
  });
});
