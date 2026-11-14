// Isolated editor-only conversion. Never load this into the game project.
using UnityEngine;
using UnityEditor;
using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;

public static class SkillVfxBaker {
 [Serializable] public class Job {
  public string id,name,prefab,package,style,slot,phase,group,part,file;
  public bool loop,rain,preserveTimeline;
  public int frames=64,fps=48,cell=128,columns=16;
  public float warmup,sourceStart,sourceDuration,pitch,hueShift;
  public string[] excludeRoots,includeRoots,includeParticles;
  public float anchorX,anchorY,startX,startY,endX,endY,aspect=1;
  public int visibleFrames;public int[] alphaBounds;
 }
 [Serializable] public class Jobs {public List<Job> clips=new List<Job>();}
 sealed class Rig : IDisposable {
  public GameObject root,ground;
  public ParticleSystem[] systems,tops;
  public List<Material> materials=new List<Material>();
  public Renderer[] renderers;
  public Job job;public Vector3 start,end;public float time;
  public Rig(Job j){
   job=j;var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(j.prefab);if(!prefab)throw new Exception("Prefab not loaded: "+j.prefab);
   root=UnityEngine.Object.Instantiate(prefab);root.name="HKD "+j.id;root.SetActive(true);root.transform.position=Vector3.zero;
   var hit=root.transform.Find("Hit_Impact");start=root.transform.position;end=hit?hit.position:start+Vector3.right*10;
   // The actual beam in this package is the Laser Blast's authored beam rig.
   // Normalize its longitudinal direction before exporting independent parts.
   if(j.slot=="beam"&&(end-start).sqrMagnitude>.001f){var rotation=Quaternion.FromToRotation((end-start).normalized,Vector3.right);root.transform.rotation=rotation*root.transform.rotation;end=rotation*(end-start);start=Vector3.zero;}
   foreach(Transform child in root.transform){bool keep=j.includeRoots==null||j.includeRoots.Length==0||j.includeRoots.Contains(child.name);if(j.excludeRoots!=null&&j.excludeRoots.Contains(child.name))keep=false;if(!keep)child.gameObject.SetActive(false);}
   foreach(var audio in root.GetComponentsInChildren<AudioSource>(true))UnityEngine.Object.DestroyImmediate(audio);
   foreach(var body in root.GetComponentsInChildren<Rigidbody>(true))body.isKinematic=true;
   foreach(var tr in root.GetComponentsInChildren<Transform>(true)){tr.gameObject.layer=29;GameObjectUtility.RemoveMonoBehavioursWithMissingScript(tr.gameObject);}
   systems=root.GetComponentsInChildren<ParticleSystem>();
   if(j.includeParticles!=null&&j.includeParticles.Length>0)foreach(var ps in systems)if(!j.includeParticles.Contains(ps.name)){var emission=ps.emission;emission.enabled=false;var renderer=ps.GetComponent<ParticleSystemRenderer>();if(renderer)renderer.enabled=false;}
   var sub=new HashSet<ParticleSystem>();foreach(var ps in systems){var module=ps.subEmitters;for(int i=0;i<module.subEmittersCount;i++)sub.Add(module.GetSubEmitterSystem(i));}
   uint seed=147;foreach(var ps in systems){var main=ps.main;main.stopAction=ParticleSystemStopAction.None;if(j.loop&&!j.preserveTimeline&&!sub.Contains(ps)){main.loop=true;main.startDelay=0;}ps.useAutoRandomSeed=false;ps.randomSeed=seed++;}
   tops=systems.Where(ps=>!sub.Contains(ps)&&!HasParticleAncestor(ps.transform,root.transform)).ToArray();
   renderers=root.GetComponentsInChildren<Renderer>();
   foreach(var renderer in renderers){var replacements=new List<Material>();foreach(var source in renderer.sharedMaterials){var mapped=MapMaterial(source,j);materials.Add(mapped);replacements.Add(mapped);}renderer.sharedMaterials=replacements.ToArray();}
   if(j.rain){ground=GameObject.CreatePrimitive(PrimitiveType.Plane);ground.name="HKD rain collision ground";ground.transform.position=new Vector3(0,-4,0);ground.transform.localScale=Vector3.one*10;UnityEngine.Object.DestroyImmediate(ground.GetComponent<MeshRenderer>());Physics.SyncTransforms();}
   Reset();
  }
  public void Reset(){time=0;foreach(var ps in systems)ps.Stop(false,ParticleSystemStopBehavior.StopEmittingAndClear);foreach(var ps in tops)ps.Play(true);foreach(var animator in root.GetComponentsInChildren<Animator>()){animator.Rebind();animator.Update(0);}}
  public void To(float target){if(target<time-.000001f)Reset();while(time<target-.000001f){float dt=Mathf.Min(1f/96,target-time);foreach(var ps in tops)ps.Simulate(dt,true,false,false);foreach(var animator in root.GetComponentsInChildren<Animator>())animator.Update(dt);time+=dt;}foreach(var mat in materials)mat.SetFloat("_HkdTime",target);}
  public IEnumerable<Bounds> Bounds(){
   foreach(var renderer in renderers)if(renderer&&renderer.enabled&&renderer.gameObject.activeInHierarchy&&Usable(renderer.bounds))yield return renderer.bounds;
   // Editor-only simulation can precede the renderer's first cull. Derive a
   // conservative envelope from live particles rather than requiring a view.
   foreach(var ps in systems){var particles=new ParticleSystem.Particle[ps.particleCount];int count=ps.GetParticles(particles);var main=ps.main;for(int i=0;i<count;i++){var p=particles[i];var at=main.simulationSpace==ParticleSystemSimulationSpace.World?p.position:ps.transform.TransformPoint(p.position);var size=p.GetCurrentSize3D(ps);float extent=Mathf.Max(size.x,Mathf.Max(size.y,size.z))*Mathf.Max(ps.transform.lossyScale.x,Mathf.Max(ps.transform.lossyScale.y,ps.transform.lossyScale.z));yield return new Bounds(at,Vector3.one*Mathf.Max(.01f,extent*2));}}
  }
  public void Dispose(){if(root)UnityEngine.Object.DestroyImmediate(root);if(ground)UnityEngine.Object.DestroyImmediate(ground);foreach(var mat in materials)UnityEngine.Object.DestroyImmediate(mat);}
 }
 static bool HasParticleAncestor(Transform child,Transform root){for(var at=child.parent;at;at=at.parent){if(at.GetComponent<ParticleSystem>())return true;if(at==root)break;}return false;}
 static SerializedProperty Saved(Material mat,string type,string key){if(!mat)return null;var props=new SerializedObject(mat).FindProperty("m_SavedProperties."+type);for(int i=0;props!=null&&i<props.arraySize;i++){var row=props.GetArrayElementAtIndex(i);if(row.FindPropertyRelative("first").stringValue==key)return row.FindPropertyRelative("second");}return null;}
 static Material MapMaterial(Material source,Job job){
  var material=new Material(Shader.Find("Hidden/HKD/SkillVfxBake"));Texture texture=null;SerializedProperty textureProp=null;
  foreach(string key in new[]{"_MainTex","_BaseMap","_Texture","_MainTexture"}){var row=Saved(source,"m_TexEnvs",key);if(row!=null&&row.FindPropertyRelative("m_Texture").objectReferenceValue){textureProp=row;texture=row.FindPropertyRelative("m_Texture").objectReferenceValue as Texture;break;}}
  if(!texture&&source){var envs=new SerializedObject(source).FindProperty("m_SavedProperties.m_TexEnvs");for(int i=0;envs!=null&&i<envs.arraySize;i++){var row=envs.GetArrayElementAtIndex(i).FindPropertyRelative("second");var candidate=row.FindPropertyRelative("m_Texture").objectReferenceValue as Texture;if(candidate){texture=candidate;textureProp=row;break;}}}
  material.mainTexture=texture;if(textureProp!=null){material.mainTextureScale=textureProp.FindPropertyRelative("m_Scale").vector2Value;material.mainTextureOffset=textureProp.FindPropertyRelative("m_Offset").vector2Value;}
  Color color=Color.white;foreach(string key in new[]{"_TintColor","_BaseColor","_Color"}){var p=Saved(source,"m_Colors",key);if(p!=null){color=p.colorValue;break;}}material.color=color;
  string shader=source&&source.shader?source.shader.name.ToLowerInvariant():"";var blend=Saved(source,"m_Floats","_DstBlend");bool additive=shader.Contains("additive")||shader.Contains("/add")||blend!=null&&Mathf.Abs(blend.floatValue-1)<.001f;
  // Beam graphs combine opaque color ramps with additive light. Convert the
  // dark background of those ramps to coverage before normal sprite blending.
  material.SetFloat("_Additive",additive||job.slot=="beam"?1:0);material.SetFloat("_HueShift",job.hueShift);
  if(source&&source.name.StartsWith("cfxr",StringComparison.OrdinalIgnoreCase)){material.color=Color.white;var single=Saved(source,"m_Floats","_SingleChannel");material.SetFloat("_SingleChannel",single==null?0:single.floatValue);}
  var alpha=Saved(source,"m_Colors","_MainAlphaChannel");if(alpha!=null){material.SetFloat("_UseChannels",1);material.SetVector("_AlphaChannel",alpha.colorValue);foreach(string name in new[]{"_MainTextureChannel","_WhiteColor","_MidColor","_LastColor"}){var value=Saved(source,"m_Colors",name);if(value!=null)material.SetVector(name=="_MainTextureChannel"?"_RgbChannel":name,value.colorValue);}}
  var scroll=Saved(source,"m_Colors","_MainTexturePanning");if(scroll!=null)material.SetVector("_Scroll",scroll.colorValue);
  return material;
 }
 static float SampleTime(Job job,int frame){float step=job.sourceDuration>0?job.sourceDuration/Mathf.Max(1,job.frames):1f/job.fps;return(job.preserveTimeline||!job.loop?job.sourceStart:job.warmup)+frame*step;}
 static bool Usable(Bounds b){return !float.IsNaN(b.center.x)&&!float.IsInfinity(b.extents.x)&&b.extents.magnitude<500&&b.extents.sqrMagnitude>.00000001f;}
 public static void Run(){
  AudioListener.pause=true;AudioListener.volume=0;
  var jobs=JsonUtility.FromJson<Jobs>(File.ReadAllText("jobs.json"));string output=Path.Combine(Directory.GetCurrentDirectory(),"Baked");Directory.CreateDirectory(output);
  var errors=new List<string>();foreach(var group in jobs.clips.GroupBy(j=>j.group))try{BakeGroup(group.ToList(),output);}catch(Exception e){errors.Add(group.Key+": "+e);Debug.LogError("HKD_VFX_FAILED "+group.Key+" "+e.Message);}
  File.WriteAllText(Path.Combine(output,"clips.json"),JsonUtility.ToJson(jobs,true));if(errors.Count>0)throw new Exception(string.Join("\n",errors.ToArray()));Debug.Log("HKD_SKILL_VFX_BAKE_COMPLETE "+jobs.clips.Count);
 }
 static void BakeGroup(List<Job> jobs,string output){
  var rotation=Quaternion.Euler(jobs[0].pitch,0,0);var inverse=Quaternion.Inverse(rotation);Vector2 minimum=new Vector2(float.PositiveInfinity,float.PositiveInfinity),maximum=new Vector2(float.NegativeInfinity,float.NegativeInfinity);
  foreach(var job in jobs)using(var rig=new Rig(job)){
   for(int f=0;f<job.frames;f+=Mathf.Max(1,job.frames/32)){
    rig.To(SampleTime(job,f));foreach(var b in rig.Bounds()){if(!Usable(b))continue;for(int corner=0;corner<8;corner++){var at=inverse*(b.center+Vector3.Scale(b.extents,new Vector3((corner&1)==0?-1:1,(corner&2)==0?-1:1,(corner&4)==0?-1:1)));minimum=Vector2.Min(minimum,at);maximum=Vector2.Max(maximum,at);}}
   }
  }
  if(float.IsInfinity(minimum.x))throw new Exception("No visible particle bounds: "+jobs[0].id);
  var center=(minimum+maximum)*.5f;float aspect=jobs[0].slot=="beam"&&jobs[0].part=="body"?4:1,size=Mathf.Max((maximum.y-minimum.y)/2,(maximum.x-minimum.x)/(2*aspect))*1.1f;size=Mathf.Clamp(size,.05f,200);
  RefineBounds(jobs,rotation,ref center,ref size,aspect);
  foreach(var job in jobs)Bake(job,output,rotation,center,size,aspect);
 }
 static void RefineBounds(List<Job> jobs,Quaternion rotation,ref Vector2 center,ref float size,float aspect){
  const int pixels=512;var obj=new GameObject("HKD bounds probe");var camera=obj.AddComponent<Camera>();var rt=new RenderTexture(pixels,pixels,24,RenderTextureFormat.ARGB32);rt.Create();var tex=new Texture2D(pixels,pixels,TextureFormat.RGBA32,false);var previous=RenderTexture.active;int minX=pixels,minY=pixels,maxX=-1,maxY=-1;
  try{camera.orthographic=true;camera.aspect=aspect;camera.orthographicSize=size;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.clear;camera.nearClipPlane=.01f;camera.farClipPlane=1000;camera.cullingMask=1<<29;camera.targetTexture=rt;camera.allowHDR=false;camera.transform.rotation=rotation;camera.transform.position=rotation*new Vector3(center.x,center.y,-100);
   foreach(var job in jobs)using(var rig=new Rig(job))for(int f=0;f<job.frames;f+=Mathf.Max(1,job.frames/24)){rig.To(SampleTime(job,f));camera.Render();RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,pixels,pixels),0,0);tex.Apply();var data=tex.GetPixels32();for(int i=0;i<data.Length;i++)if(data[i].a>5){minX=Math.Min(minX,i%pixels);maxX=Math.Max(maxX,i%pixels);minY=Math.Min(minY,i/pixels);maxY=Math.Max(maxY,i/pixels);}}
   if(maxX>=minX){var offset=new Vector2(((minX+maxX+1f)/pixels-.999999f)*size*aspect,((minY+maxY+1f)/pixels-.999999f)*size);center+=offset;size*=Mathf.Max((maxY-minY+1f)/pixels,(maxX-minX+1f)/pixels)*1.12f;}
  }finally{RenderTexture.active=previous;camera.targetTexture=null;rt.Release();UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(tex);UnityEngine.Object.DestroyImmediate(obj);}
 }
 static void Bake(Job job,string output,Quaternion rotation,Vector2 center,float size,float aspect){
  using(var rig=new Rig(job)){
   var cameraNode=new GameObject("HKD silent particle camera");var camera=cameraNode.AddComponent<Camera>();var rt=new RenderTexture(job.cell,job.cell,24,RenderTextureFormat.ARGB32);rt.antiAliasing=1;rt.Create();var frame=new Texture2D(job.cell,job.cell,TextureFormat.RGBA32,false);
   int rows=Mathf.CeilToInt((float)job.frames/job.columns);var sheet=new Texture2D(job.cell*job.columns,job.cell*rows,TextureFormat.RGBA32,false);var pixels=new List<Color32[]>();int seam=job.loop?Mathf.Max(4,job.frames/8):0;
   var previous=RenderTexture.active;
   try{
    camera.orthographic=true;camera.aspect=aspect;camera.orthographicSize=size;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.clear;camera.nearClipPlane=.01f;camera.farClipPlane=1000;camera.cullingMask=1<<29;camera.targetTexture=rt;camera.allowHDR=false;camera.transform.rotation=rotation;camera.transform.position=rotation*new Vector3(center.x,center.y,-100);
    job.aspect=aspect;var reference=job.part=="target"?rig.end:rig.start;var projected=Quaternion.Inverse(rotation)*reference;job.anchorX=(projected.x-center.x)/(size*2*aspect)+.5f;job.anchorY=(projected.y-center.y)/(size*2)+.5f;
    var a=Quaternion.Inverse(rotation)*rig.start;var b=Quaternion.Inverse(rotation)*rig.end;job.startX=(a.x-center.x)/(size*2*aspect)+.5f;job.startY=(a.y-center.y)/(size*2)+.5f;job.endX=(b.x-center.x)/(size*2*aspect)+.5f;job.endY=(b.y-center.y)/(size*2)+.5f;
    for(int f=0;f<job.frames+seam;f++){rig.To(SampleTime(job,f));camera.Render();RenderTexture.active=rt;frame.ReadPixels(new Rect(0,0,job.cell,job.cell),0,0);frame.Apply();pixels.Add(frame.GetPixels32());}
    int minX=job.cell,minY=job.cell,maxX=-1,maxY=-1;job.visibleFrames=0;
    for(int f=0;f<job.frames;f++){
     var values=pixels[f+seam];if(seam>0&&f>=job.frames-seam){float blend=(float)(f-(job.frames-seam)+1)/seam;var other=pixels[f-(job.frames-seam)];for(int i=0;i<values.Length;i++)values[i]=Color32.Lerp(values[i],other[i],blend);}
     bool visible=false;for(int i=0;i<values.Length;i++){var p=values[i];if(p.a>0&&p.a<255){p.r=(byte)Math.Min(255,Math.Round(p.r*255f/p.a));p.g=(byte)Math.Min(255,Math.Round(p.g*255f/p.a));p.b=(byte)Math.Min(255,Math.Round(p.b*255f/p.a));values[i]=p;}if(p.a>8){int x=i%job.cell,y=i/job.cell;minX=Math.Min(minX,x);maxX=Math.Max(maxX,x);minY=Math.Min(minY,y);maxY=Math.Max(maxY,y);visible=true;}}
     if(visible)job.visibleFrames++;sheet.SetPixels32((f%job.columns)*job.cell,(rows-1-f/job.columns)*job.cell,job.cell,job.cell,values);
    }
    if(job.visibleFrames==0&&job.phase!="start")throw new Exception("Empty VFX capture: "+job.id);
    job.alphaBounds=new[]{minX,minY,maxX,maxY};job.file=job.id+".png";sheet.Apply();File.WriteAllBytes(Path.Combine(output,job.file),sheet.EncodeToPNG());Debug.Log("HKD_VFX_CLIP "+job.id+" visible="+job.visibleFrames+"/"+job.frames+" bounds="+minimumText(job.alphaBounds));
   }finally{RenderTexture.active=previous;camera.targetTexture=null;rt.Release();UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(frame);UnityEngine.Object.DestroyImmediate(sheet);UnityEngine.Object.DestroyImmediate(cameraNode);}
  }
 }
 static string minimumText(int[] values){return string.Join(",",values.Select(v=>v.ToString()).ToArray());}
}
