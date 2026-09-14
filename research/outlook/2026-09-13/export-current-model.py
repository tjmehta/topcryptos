"""Export current-cutoff fits from available mature history, without new validation claims."""
import argparse
import copy
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import warnings

import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
SOURCE=ROOT/'research/daily-breakouts/2026-09-13'
FROZEN=ROOT/'research/sell-zone-forecast/2026-09-13/run.py'
DEFAULT_OUTPUT=ROOT/'modules/data/ohlc-models.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('x') as f:
        json.dump(value,f,indent=2,allow_nan=False)
        f.write('\n')


def sigmoid(value):
    if value>=0:
        return 1/(1+math.exp(-value))
    ex=math.exp(value)
    return ex/(1+ex)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cutoff',required=True,help='Exact UTC month start, YYYY-MM-DD')
    parser.add_argument('--output',type=Path,default=DEFAULT_OUTPUT)
    parser.add_argument('--manifest',type=Path,default=HERE/'current-model-export.json')
    args=parser.parse_args()
    cutoff=dt.date.fromisoformat(args.cutoff)
    assert cutoff.day==1 and cutoff.isoformat()==args.cutoff
    now=dt.datetime.now(dt.timezone.utc)
    assert cutoff<=now.date().replace(day=1),'Cannot label a future training cutoff as currently available'
    for path in [args.output,args.manifest]:
        if path.exists():
            raise FileExistsError(path)
    old_manifest=json.loads((HERE/'bundle-manifest.json').read_text())
    assert sha(HERE/'model-bundle.json')==old_manifest['bundle_sha256']
    source_summary=json.loads((SOURCE/'exit-summary.json').read_text())
    forecast_summary=json.loads((SOURCE/'forecast-summary.json').read_text())
    verification=json.loads((SOURCE/'forecast-verification.json').read_text())
    assert verification['status']=='passed'
    assert sha(SOURCE/'exit-ledger.json.gz')==source_summary['ledger_sha256']
    for document in [source_summary,forecast_summary,verification]:
        for name,expected in document['hashes'].items():
            assert sha(ROOT/name)==expected,name
    spec=importlib.util.spec_from_file_location('current_export_frozen_features',FROZEN)
    ff=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ff)
    ff.selftest()
    original=json.loads((HERE/'model-bundle.json').read_text())
    assert len(original['fits'])==74 and len(original['metrics'])==296
    assert all(f['cutoff']!=args.cutoff for f in original['fits']),'Use the existing exact-month fit'
    ledger=json.loads(gzip.decompress((SOURCE/'exit-ledger.json.gz').read_bytes()))
    new_fits=[]
    verification_rows=[]
    all_warnings=[]
    for policy in ff.POLICIES:
        events=[]
        for key,variants in sorted(ledger['outcomes'].items()):
            identity,signal,hold=json.loads(key)
            assert hold==30
            o=variants[policy]
            xs=ff.features(o,hold)
            if xs is None:
                continue
            assert o['level_source_date']==signal<o['entry_date']<o['hard_exit_date']
            events.append(dict(key=key,signal=signal,hard_exit=o['hard_exit_date'],
                               features=xs,label=o['target_reach']))
        assert len(events)==len({r['key'] for r in events})
        train=ff.eligible_train(events,args.cutoff)
        independent_train=[r for r in events if r['label'] is not None and r['hard_exit']<args.cutoff]
        assert train==independent_train
        assert len(train)>=200 and len({r['label'] for r in train})==2
        x=np.array([r['features'] for r in train])
        y=np.array([r['label'] for r in train],dtype=int)
        model=make_pipeline(StandardScaler(),LogisticRegression(C=1.,solver='lbfgs',max_iter=1000))
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            model.fit(x,y)
        all_warnings.extend(dict(policy=policy,category=w.category.__name__,message=str(w.message)) for w in caught)
        assert model[-1].n_iter_[0]<1000
        fit=dict(fit_id=f'{policy}:{args.cutoff}',policy=policy,cutoff=args.cutoff,
            training_n=len(train),training_hits=int(y.sum()),
            distinct_training_signals=len({r['signal'] for r in train}),
            latest_training_exit=max(r['hard_exit'] for r in train),
            baseline_probability=(int(y.sum())+1)/(len(y)+2),
            scaler_mean=model[0].mean_.tolist(),scaler_scale=model[0].scale_.tolist(),
            coefficients=model[-1].coef_[0].tolist(),intercept=float(model[-1].intercept_[0]))
        # Independent moments, scalar probability arithmetic and objective gradient.
        # These checks establish a correct fit/export, not predictive performance.
        mean=np.array(fit['scaler_mean']);scale=np.array(fit['scaler_scale']);coef=np.array(fit['coefficients'])
        assert np.isfinite(mean).all() and np.isfinite(scale).all() and np.isfinite(coef).all()
        assert np.isfinite(fit['intercept']) and (scale>0).all()
        independent_mean=np.mean(x,axis=0)
        independent_scale=np.std(x,axis=0,ddof=0)
        constants=np.all(x==x[0],axis=0)
        independent_scale[constants]=1.
        assert np.allclose(mean,independent_mean,rtol=2e-10,atol=2e-12)
        assert np.allclose(scale,independent_scale,rtol=2e-10,atol=2e-12)
        assert constants[4] and scale[4]==1.
        constant_contribution=abs(float((math.log1p(30)-mean[4])*coef[4]))
        assert constant_contribution<1e-10
        all_x=np.array([r['features'] for r in events])
        implementation=model.predict_proba(all_x)[:,1]
        independent=np.array([sigmoid(math.fsum((float(value)-float(mu))/float(sd)*float(c)
            for value,mu,sd,c in zip(row,mean,scale,coef))+fit['intercept']) for row in all_x])
        max_error=float(np.max(np.abs(implementation-independent)))
        assert max_error<2e-12
        standardized=(x-mean)/scale
        probabilities=np.array([sigmoid(float(z)) for z in standardized@coef+fit['intercept']])
        residual=probabilities-y
        gradient=max(float(np.max(np.abs(standardized.T@residual/len(y)+coef/len(y)))),abs(float(np.mean(residual))))
        assert gradient<3e-4
        new_fits.append(fit)
        verification_rows.append(dict(policy=policy,cutoff=args.cutoff,training_n=len(train),
            training_hits=int(y.sum()),latest_training_exit=fit['latest_training_exit'],
            prediction_arithmetic_checks=len(events),max_probability_error=max_error,
            max_objective_gradient=gradient,constant_h_scale=float(scale[4]),
            constant_h_logit_contribution=constant_contribution))
    bundle=copy.deepcopy(original)
    bundle['fits'].extend(new_fits)
    bundle['created_utc']=now.isoformat()
    last_support=max(f['latest_training_exit'] for f in new_fits)
    bundle['source'].update(training_support_end=last_support,
        forecast_last_cutoff=max(f['cutoff'] for f in bundle['fits']),
        validated_forecast_last_cutoff=original['source']['forecast_last_cutoff'],
        current_fit_cutoff=args.cutoff,current_fit_created_utc=now.isoformat(),
        current_fit_training_support_end=last_support,
        current_fit_training_data_age_days=(now.date()-dt.date.fromisoformat(last_support)).days,
        current_fit_calibration='not-evaluated-on-current-period',
        validation_scope='Metrics describe retrospective 2023-2025 signals under the original monthly models; they do not validate the newly exported current-period fits.',
        current_fit_training_scope='Original preselected annual 2020-2025 venue cohorts only, using all known full-H30 labels strictly before cutoff; no new current-universe outcomes added.',
        availability_scope='Current fits become available at current_fit_created_utc. The training cutoff is not an earlier model publication date.',
        current_fit_source_ledger_sha256=sha(SOURCE/'exit-ledger.json.gz'),
        original_model_bundle_sha256=sha(HERE/'model-bundle.json'))
    assert bundle['fits'][:74]==original['fits'] and bundle['metrics']==original['metrics']
    save(args.output,bundle)
    reloaded=json.loads(args.output.read_text())
    assert reloaded==bundle
    inputs=[Path(__file__),HERE/'model-bundle.json',HERE/'bundle-manifest.json',
            SOURCE/'exit-ledger.json.gz',SOURCE/'exit-summary.json',SOURCE/'forecast-summary.json',
            SOURCE/'forecast-verification.json',FROZEN]
    manifest=dict(schema_version=1,status='verified-export',created_utc=now.isoformat(),
        completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        output=str(args.output.relative_to(ROOT)) if args.output.is_relative_to(ROOT) else str(args.output),
        bundle_sha256=sha(args.output),hashes={str(p.relative_to(ROOT)):sha(p) for p in inputs},
        requested_cutoff=args.cutoff,original_fits=74,new_fits=len(new_fits),metrics=296,
        packages=dict(sklearn=sklearn.__version__,numpy=np.__version__),
        verification=verification_rows,captured_fit_warnings=all_warnings,
        performance_validation='Not performed for current cutoff. Verification covers causal data eligibility, fitting arithmetic and unchanged export only.')
    save(args.manifest,manifest)
    print(json.dumps(dict(output=manifest['output'],bundle_sha256=manifest['bundle_sha256'],
                          current_fit_cutoff=args.cutoff,verification=verification_rows)))


if __name__=='__main__':
    main()
