'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
const setup=String.raw`
import copy,importlib.util,json,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('skill_vfx_import','tools/skills-vfx/import-bake.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
catalog=json.loads(Path('assets/resources/vfx/hero-skills/catalog.json').read_text())
# User-sheet entries join publication after the complete workbook capture set.
rows=copy.deepcopy([row for row in catalog['clips'] if row.get('source',{}).get('kind')!='user-sheet'])
for row in rows:
    row.update(row.pop('source'));row['file']=row['id']+'.png'
jobs=copy.deepcopy(rows)
with tempfile.TemporaryDirectory(prefix='skill-vfx-import-') as temporary:
    bake=Path(temporary);(bake/'Baked').mkdir()
    def write(values=rows,planned=jobs,source=None):
        (bake/'Baked/clips.json').write_text(json.dumps({'clips':values}))
        (bake/'jobs.json').write_text(json.dumps({'clips':planned}))
        (bake/'source.json').write_text(json.dumps(source or {'workbookSha256':catalog['workbookSha256']}))
    write()
`;
function run(code){
 const result=spawnSync(python,['-B','-c',setup+code],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);
}
test('VFX importer accepts the complete capture contract without comparing a later workbook hash',()=>run(String.raw`
    accepted,source=module.capture_rows(bake)
    assert len(accepted)==18
    assert source['workbookSha256']==catalog['workbookSha256']
    write(source={'workbookSha256':'f'*64})
    assert module.capture_rows(bake)[1]['workbookSha256']=='f'*64
`));
test('VFX importer rejects missing, duplicate, mismatched, unsafe and invalid capture rows before publication',()=>run(String.raw`
    cases=[]
    def changed(key,value):
        altered=copy.deepcopy(rows);altered[0][key]=value;return altered
    cases.extend([[],rows[:-1],rows+[rows[0]],changed('file','../outside.png'),changed('frames',1),changed('fps',True),changed('anchorX',float('nan')),changed('visibleFrames',0),changed('alphaBounds',[-1,0,20,20])])
    for altered in cases:
        write(altered)
        try:module.capture_rows(bake)
        except ValueError:pass
        else:raise AssertionError('Accepted invalid capture: '+str(altered[:1]))
    for key,value in [('fps',241),('loop',1),('columns',257),('frames',4097)]:
        altered=changed(key,value);write(altered,copy.deepcopy(altered))
        try:module.capture_rows(bake)
        except ValueError:pass
        else:raise AssertionError('Accepted unsupported runtime layout: '+key)
    write(planned=jobs[:-1])
    try:module.capture_rows(bake)
    except ValueError:pass
    else:raise AssertionError('Accepted incomplete bake jobs')
    write([])
    module.Transaction=lambda *_: (_ for _ in ()).throw(AssertionError('Invalid capture reached publication'))
    try:module.run(bake,bake/'backups')
    except ValueError:pass
    else:raise AssertionError('Empty capture did not fail')
`));
