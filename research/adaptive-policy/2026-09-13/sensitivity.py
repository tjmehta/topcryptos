"""Declared follow-up: common maturity cutoff and deployment start sensitivity.

Written after initial results: this is diagnostic, never new holdout evidence.
Keep training data unchanged when shifting first deployment by 0/28/56 days;
initial capital waits in cash. Compare native per-hold maturity with a shared
maximum-horizon cutoff (signal+92d strictly before decision) for all candidates.
"""
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('policy', HERE / 'run.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def common_history(records, decision, method, hold):
    return sorted((r for r in records if r['method'] == method and r['holding'] == hold
                   and policy.date(r) + 92 * policy.DAY < decision), key=policy.date)[-24:]


def main():
    target = HERE / 'sensitivity.json'
    if target.exists():
        raise FileExistsError(target)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    raw = (policy.SOURCE / 'cohorts.json.gz').read_bytes()
    original = json.loads((HERE / 'summary.json').read_text())
    assert hashlib.sha256(raw).hexdigest() == original['source_ledger_sha256']
    rows = [r for r in json.loads(gzip.decompress(raw)) if r['method'] in policy.METHODS and r['holding'] in policy.HOLDS]
    normal = policy.historical
    results = []
    policies = ['method-only', 'hold-only', 'joint'] + [f'fixed:{m}:{h}' for m in policy.METHODS for h in policy.HOLDS]
    for phase in [0, 1, 2]:
        policy.START = dt.date(2023, 1, 1) + 28 * phase * policy.DAY
        for training in ['per-hold-maturity', 'common-90d-maturity']:
            policy.historical = normal if training == 'per-hold-maturity' else common_history
            for view in sorted({r['view'] for r in rows}):
                records = [r for r in rows if r['view'] == view]
                if training == 'common-90d-maturity':
                    for signal in sorted({policy.date(r) for r in records if policy.date(r) >= policy.START}):
                        samples = [common_history(records, signal, m, h) for m in policy.METHODS for h in policy.HOLDS]
                        assert all([r['signal'] for r in sample] == [r['signal'] for r in samples[0]] for sample in samples)
                for name in policies:
                    # Fixed policies' choices do not use training, so avoid duplicates.
                    if training == 'common-90d-maturity' and name.startswith('fixed:'):
                        continue
                    summary, ledger = policy.simulate(records, name)
                    results.append({'phase': phase, 'first_deployment_signal': policy.START.isoformat(),
                                    'training': training, 'view': view, **summary})
    result = {'started_at_utc': started, 'completed_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
              'source_ledger_sha256': original['source_ledger_sha256'],
              'base_runner_sha256': hashlib.sha256((HERE / 'run.py').read_bytes()).hexdigest(),
              'sensitivity_runner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'status': 'post-result sensitivity, no tuning or automatic policy adoption', 'summary': results}
    with target.open('x') as f:
        json.dump(result, f, indent=2, allow_nan=False)
        f.write('\n')
    print('Saved', len(results), 'start-phase/training-window sensitivity cells')


if __name__ == '__main__':
    main()
