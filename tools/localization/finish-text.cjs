const fs=require('fs'),vm=require('vm');const p='tools/localization/text-entries.json';let d=JSON.parse(fs.readFileSync(p,'utf8'));function add(id,zh,en,context){d.entries[id]={zh,en,context};return 'require("LanguageMgr").LanguageMgr.getInstance().t("'+id+'", '}
function patch(file,fn){let s=fs.readFileSync(file,'utf8'),n=fn(s);new vm.Script(n);fs.writeFileSync(file,n)}
let seconds=add('format.seconds','{0}秒','{0}s','KinghtFallHomeBattleCtrl countdown');
patch('assets/_script/KinghtFallHomeBattleCtrl.js',s=>s.replace('o - r + "s"',seconds+'[o - r])'));
let count=add('format.multiplier','x{0}','x{0}','KinghtFallUIGame speed; KinghtFallUISideBoard quantity');
patch('assets/_script/KinghtFallUIGame.js',s=>s.replace('.string = "x1"','.string = '+count+'[1])').replace('.string = "x" + e[t.spIdx]','.string = '+count+'[e[t.spIdx]])'));
patch('assets/_script/KinghtFallUISideBoard.js',s=>s.replace('"x" + $z1KinghtFallModle.default.getInstance().numberFomat(n)',count+'[$z1KinghtFallModle.default.getInstance().numberFomat(n)])'));
patch('assets/_script/GAD_UISetting.js',s=>s.replace('    this.bindEvent();','    this.bindEvent();\n    require("LanguageOptions").attach(this.node, -67);'));
patch('assets/_script/PlatformConfig.js',s=>s.replace(/appTitle: (require\("LanguageMgr"\).LanguageMgr.getInstance\(\).T\([^\n]+\))([,\r\n])/g,'get appTitle() { return $1; }$2'));
// Existing typographic quote marks are not valid rich-text color syntax.
for(let f of ['KinghtFallUIBuff','KinghtFallUISuspend'])patch('assets/_script/'+f+'.js',s=>s.replaceAll('color=“#000000”','color=#000000'));
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
// Keep migration idempotent; authored catalog data must survive subsequent extraction passes.
patch('tools/localization/migrate-text.cjs',s=>s.replace('const entries={},bySource=new Map(),changes=[],miss=[];','const entries=fs.existsSync("tools/localization/text-entries.json") ? JSON.parse(fs.readFileSync("tools/localization/text-entries.json", "utf8")).entries : {},bySource=new Map(Object.entries(entries).map(([k,v])=>[v.zh,k])),changes=[],miss=[];'));
console.log(Object.keys(d.entries).length+' complete text entries');
