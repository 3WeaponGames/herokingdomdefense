// Run only in the disposable Unity project created by prepare-toon.py.
// We bake authored particle geometry to silent, platform-independent 2D clips.
using UnityEngine;
using UnityEditor;
using UnityEngine.Rendering;
using System;
using System.IO;
using System.Collections.Generic;

public static class ToonBaker {
    [Serializable] public class Clip { public string name, file, blending; public int frames=32, columns=8, cell=256, fps=24; public bool loop; }
    [Serializable] public class Result { public List<Clip> clips=new List<Clip>(); public string framing="rendered-alpha",materials; public int supersampling=2; }
    static Texture SavedTexture(Material mat, string key) {
        var rows=new SerializedObject(mat).FindProperty("m_SavedProperties.m_TexEnvs");
        for(int i=0;rows!=null && i<rows.arraySize;i++) { var row=rows.GetArrayElementAtIndex(i); if(row.FindPropertyRelative("first").stringValue==key) return row.FindPropertyRelative("second.m_Texture").objectReferenceValue as Texture; }
        return null;
    }
    static Color SavedColor(Material mat) {
        var rows=new SerializedObject(mat).FindProperty("m_SavedProperties.m_Colors");
        for(int i=0;rows!=null && i<rows.arraySize;i++) { var row=rows.GetArrayElementAtIndex(i); string key=row.FindPropertyRelative("first").stringValue; if(key=="_TintColor"||key=="_Color") return row.FindPropertyRelative("second").colorValue; }
        return Color.white;
    }
    static float SavedFloat(Material mat,string key,float fallback) {
        var rows=new SerializedObject(mat).FindProperty("m_SavedProperties.m_Floats");
        for(int i=0;rows!=null&&i<rows.arraySize;i++){var row=rows.GetArrayElementAtIndex(i);if(row.FindPropertyRelative("first").stringValue==key)return row.FindPropertyRelative("second").floatValue;}
        return fallback;
    }
    static string SourceShader(Material source) {
        string path=source?AssetDatabase.GetAssetPath(source):"";if(!path.StartsWith("Assets/"))return "";
        var match=System.Text.RegularExpressions.Regex.Match(File.ReadAllText(path),@"m_Shader:.*guid: ([a-f0-9]{32})");return match.Success?match.Groups[1].Value:"";
    }
    public static void Run() {
        AudioListener.pause=true; AudioListener.volume=0;
        string output=Path.Combine(Directory.GetCurrentDirectory(),"Baked"),filter=null;bool sourceMaterials=true;
        var args=Environment.GetCommandLineArgs();for(int i=0;i<args.Length;i++){if(args[i]=="-hkdOutput"&&i+1<args.Length)output=args[++i];else if(args[i]=="-hkdClip"&&i+1<args.Length)filter=args[++i];else if(args[i]=="-hkdFlatMaterials")sourceMaterials=false;}
        Directory.CreateDirectory(output);var result=new Result{materials=sourceMaterials?"authored-built-in":"unlit-texture"};
        foreach(string guid in AssetDatabase.FindAssets("t:Prefab",new[]{"Assets/Hovl Studio/Toon Projectiles 2/Prefabs"})) {
            string file=AssetDatabase.GUIDToAssetPath(guid),name=Path.GetFileNameWithoutExtension(file);
            if(!name.StartsWith("Projectile ")&&!name.StartsWith("Flash ")&&!name.StartsWith("Hit "))continue;
            if(filter!=null&&name!=filter)continue;
            var clip=new Clip{name=name,file=name.Replace(' ','-').ToLowerInvariant()+".png",loop=name.StartsWith("Projectile ")};
            Bake(file,Path.Combine(output,clip.file),clip,sourceMaterials);result.clips.Add(clip);
            Debug.Log("HKD baked "+name);
        }
        if(result.clips.Count!=(filter==null?45:1))throw new Exception("Unexpected Toon clip count: "+result.clips.Count);
        File.WriteAllText(Path.Combine(output,"clips.json"),JsonUtility.ToJson(result,true));
        Debug.Log("HKD_TOON_BAKE_COMPLETE");
    }
    static void Bake(string file,string output,Clip clip,bool sourceMaterials) {
        var root=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(file));
        var materials=new List<Material>();
        var cameraObject=new GameObject("HKD capture camera");var camera=cameraObject.AddComponent<Camera>();
        int capture=clip.cell*2;
        var rt=new RenderTexture(capture,capture,24,RenderTextureFormat.ARGB32);rt.antiAliasing=4;rt.Create();
        var downsampled=new RenderTexture(clip.cell,clip.cell,0,RenderTextureFormat.ARGB32);downsampled.Create();
        var probe=new Texture2D(capture,capture,TextureFormat.RGBA32,false);
        var frame=new Texture2D(clip.cell,clip.cell,TextureFormat.RGBA32,false);
        var sheet=new Texture2D(clip.cell*clip.columns,clip.cell*(clip.frames/clip.columns),TextureFormat.RGBA32,false);
        try {
            root.transform.position=Vector3.zero;root.transform.rotation=Quaternion.Euler(0,90,0);
            // Flight prefabs embed their launch/impact instances. Export those
            // separately so mixing clips never plays a hit at launch time.
            if(clip.loop)foreach(var tr in root.GetComponentsInChildren<Transform>(true))if(tr && tr!=root.transform&&(tr.name.StartsWith("Hit ")||tr.name.StartsWith("Flash ")))UnityEngine.Object.DestroyImmediate(tr.gameObject);
            foreach(var audio in root.GetComponentsInChildren<AudioSource>(true))UnityEngine.Object.DestroyImmediate(audio);
            foreach(var body in root.GetComponentsInChildren<Rigidbody>(true))body.isKinematic=true;
            var modes=new HashSet<string>();
            foreach(var renderer in root.GetComponentsInChildren<Renderer>(true)) {
                var mapped=new List<Material>();foreach(var source in renderer.sharedMaterials) {
                    if(sourceMaterials&&renderer.enabled&&renderer.gameObject.activeInHierarchy){string shaderGuid=SourceShader(source);if(shaderGuid!="df628dd226338d7419358b8bff74bea2")modes.Add(shaderGuid=="00191177e5fd5c4468ad546ce87ef329"&&SavedFloat(source,"_DstBlend",10)==1?"additive":"alpha");}
                    var material=MapMaterial(source,sourceMaterials);
                    mapped.Add(material);materials.Add(material);
                }renderer.sharedMaterials=mapped.ToArray();
            }
            clip.blending=modes.Count==1&&modes.Contains("additive")?"additive":modes.Count>1?"mixed":"alpha";
            Debug.Log("HKD blending "+clip.name+" "+clip.blending);
            var systems=root.GetComponentsInChildren<ParticleSystem>(true);
            uint seed=147;foreach(var ps in systems){var main=ps.main;main.stopAction=ParticleSystemStopAction.None;ps.useAutoRandomSeed=false;ps.randomSeed=seed++;}
            Reset(root,systems);
            camera.orthographic=true;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.clear;camera.nearClipPlane=.01f;camera.farClipPlane=1000;camera.targetTexture=rt;
            // Measure the whole deterministic clip first; every frame then has
            // the same scale and anchor (no visible breathing/jumping).
            float extent=.25f;
            for(int f=0;f<clip.frames;f++) {
                Step(root,systems,clip.loop,f,clip.fps);
                foreach(var r in root.GetComponentsInChildren<Renderer>())if(r.enabled&&r.gameObject.activeInHierarchy){var b=r.bounds;var c=b.center-root.transform.position;extent=Mathf.Max(extent,Mathf.Abs(c.x)+b.extents.x,Mathf.Abs(c.y)+b.extents.y);}
            }
            camera.orthographicSize=extent*1.12f;
            // Particle culling bounds are deliberately conservative. Framing
            // from them alone reduced some old captures to six useful pixels.
            // Measure rendered coverage, then recapture at the actual scale.
            Reset(root,systems);int minX=capture,minY=capture,maxX=-1,maxY=-1;
            for(int f=0;f<clip.frames;f++) {
                Step(root,systems,clip.loop,f,clip.fps);PositionCamera(camera,root,Vector2.zero);
                camera.Render();RenderTexture.active=rt;probe.ReadPixels(new Rect(0,0,capture,capture),0,0);probe.Apply();
                var pixels=probe.GetPixels32();for(int y=0;y<capture;y++)for(int x=0;x<capture;x++)if(pixels[y*capture+x].a>8){minX=Math.Min(minX,x);minY=Math.Min(minY,y);maxX=Math.Max(maxX,x);maxY=Math.Max(maxY,y);}
            }
            if(maxX<0)throw new Exception("Empty particle preflight: "+file);
            if(minX==0||minY==0||maxX==capture-1||maxY==capture-1)throw new Exception("Particle preflight reaches camera edge: "+file);
            float worldPerPixel=camera.orthographicSize*2/capture;
            var center=new Vector2(((minX+maxX+1)*.5f-capture*.5f)*worldPerPixel,((minY+maxY+1)*.5f-capture*.5f)*worldPerPixel);
            camera.orthographicSize=Math.Max(maxX-minX+1,maxY-minY+1)*worldPerPixel*.56f;
            Debug.Log("HKD framing "+clip.name+" visible="+(maxX-minX+1)+"x"+(maxY-minY+1)+"/"+capture+" camera="+camera.orthographicSize);
            Reset(root,systems);
            for(int f=0;f<clip.frames;f++) {
                Step(root,systems,clip.loop,f,clip.fps);PositionCamera(camera,root,center);
                camera.Render();Graphics.Blit(rt,downsampled);RenderTexture.active=downsampled;frame.ReadPixels(new Rect(0,0,clip.cell,clip.cell),0,0);frame.Apply();
                // Store row zero at the top, matching Cocos SpriteFrame rects.
                sheet.SetPixels((f%clip.columns)*clip.cell,(clip.frames/clip.columns-1-f/clip.columns)*clip.cell,clip.cell,clip.cell,frame.GetPixels());
            }
            sheet.Apply();bool visible=false;foreach(var pixel in sheet.GetPixels32())if(pixel.a>0){visible=true;break;}
            if(!visible)throw new Exception("Empty particle capture: "+file+" (systems="+systems.Length+", active="+root.activeInHierarchy+")");
            File.WriteAllBytes(output,sheet.EncodeToPNG());
        } finally {
            RenderTexture.active=null;camera.targetTexture=null;rt.Release();
            downsampled.Release();UnityEngine.Object.DestroyImmediate(downsampled);UnityEngine.Object.DestroyImmediate(probe);
            UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(frame);UnityEngine.Object.DestroyImmediate(sheet);
            UnityEngine.Object.DestroyImmediate(root);UnityEngine.Object.DestroyImmediate(cameraObject);foreach(var mat in materials)UnityEngine.Object.DestroyImmediate(mat);
        }
    }
    static void Reset(GameObject root,ParticleSystem[] systems) {root.transform.position=Vector3.zero;foreach(var ps in systems){ps.Stop(false,ParticleSystemStopBehavior.StopEmittingAndClear);ps.Play(false);}}
    static void PositionCamera(Camera camera,GameObject root,Vector2 center) {camera.transform.position=root.transform.position+new Vector3(center.x,center.y,-100);camera.transform.rotation=Quaternion.identity;}
    static Material MapMaterial(Material source,bool authored) {
        string path=source?AssetDatabase.GetAssetPath(source):"";
        if(authored&&source&&path.StartsWith("Assets/")) {
            // Shader Graph assets cannot compile in the isolated Built-in
            // project. These are the vendor's corresponding Built-in shaders.
            string shaderGuid=SourceShader(source);
            string shaderName=shaderGuid=="00191177e5fd5c4468ad546ce87ef329"?"Blend_CenterGlow":shaderGuid=="23b841a5164f097488432f6f3df2e185"?"Blend_TwoSides":shaderGuid=="145bae762d8de8f4c8fb1b284128fae7"?"DissolveNoise":null;
            if(shaderGuid=="df628dd226338d7419358b8bff74bea2")return new Material(Shader.Find("Hidden/HKD/InvisibleDistortion"));
            if(shaderName==null)throw new Exception("Unmapped authored material: "+path+" shader="+shaderGuid);
            var shader=Shader.Find("Hidden/HKD/"+shaderName);if(!shader||!shader.isSupported)throw new Exception("Unsupported capture shader: "+shaderName);
            var material=new Material(source);material.shader=shader;material.shaderKeywords=new string[0];return material;
        }
        var fallback=new Material(Shader.Find("Hidden/HKD/ParticleBake"));fallback.mainTexture=source?SavedTexture(source,"_MainTex"):null;fallback.color=source?SavedColor(source):Color.white;
        if(authored&&source&&source.HasProperty("_MainTex"))fallback.mainTexture=source.mainTexture;
        return fallback;
    }
    static void Step(GameObject root,ParticleSystem[] systems,bool flight,int frame,int fps) {
        if(flight)root.transform.position=new Vector3((frame+1)*.15f,0,0);
        foreach(var ps in systems)ps.Simulate(1f/fps,false,false,true);
        Shader.SetGlobalVector("_HKDCaptureTime",new Vector4((frame+1f)/fps/20,(frame+1f)/fps,(frame+1f)/fps*2,(frame+1f)/fps*3));
    }
}
