// Run only in the disposable Unity project created by prepare-toon.py.
// We bake authored particle geometry to silent, platform-independent 2D clips.
using UnityEngine;
using UnityEditor;
using UnityEngine.Rendering;
using System;
using System.IO;
using System.Collections.Generic;

public static class ToonBaker {
    [Serializable] public class Clip { public string name, file; public int frames=32, columns=8, cell=128, fps=24; public bool loop; }
    [Serializable] public class Result { public List<Clip> clips=new List<Clip>(); }
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
    public static void Run() {
        AudioListener.pause=true; AudioListener.volume=0;
        string output=Path.Combine(Directory.GetCurrentDirectory(),"Baked");
        var args=Environment.GetCommandLineArgs();for(int i=0;i<args.Length-1;i++)if(args[i]=="-hkdOutput")output=args[i+1];
        Directory.CreateDirectory(output);var result=new Result();
        foreach(string guid in AssetDatabase.FindAssets("t:Prefab",new[]{"Assets/Hovl Studio/Toon Projectiles 2/Prefabs"})) {
            string file=AssetDatabase.GUIDToAssetPath(guid),name=Path.GetFileNameWithoutExtension(file);
            if(!name.StartsWith("Projectile ")&&!name.StartsWith("Flash ")&&!name.StartsWith("Hit "))continue;
            var clip=new Clip{name=name,file=name.Replace(' ','-').ToLowerInvariant()+".png",loop=name.StartsWith("Projectile ")};
            Bake(file,Path.Combine(output,clip.file),clip);result.clips.Add(clip);
            Debug.Log("HKD baked "+name);
        }
        if(result.clips.Count!=45)throw new Exception("Expected all 45 Toon clips, got "+result.clips.Count);
        File.WriteAllText(Path.Combine(output,"clips.json"),JsonUtility.ToJson(result,true));
        Debug.Log("HKD_TOON_BAKE_COMPLETE");
    }
    static void Bake(string file,string output,Clip clip) {
        var root=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(file));
        var materials=new List<Material>();
        var cameraObject=new GameObject("HKD capture camera");var camera=cameraObject.AddComponent<Camera>();
        var rt=new RenderTexture(clip.cell,clip.cell,24,RenderTextureFormat.ARGB32);rt.antiAliasing=2;rt.Create();
        var frame=new Texture2D(clip.cell,clip.cell,TextureFormat.RGBA32,false);
        var sheet=new Texture2D(clip.cell*clip.columns,clip.cell*(clip.frames/clip.columns),TextureFormat.RGBA32,false);
        try {
            root.transform.position=Vector3.zero;root.transform.rotation=Quaternion.Euler(0,90,0);
            // Flight prefabs embed their launch/impact instances. Export those
            // separately so mixing clips never plays a hit at launch time.
            if(clip.loop)foreach(var tr in root.GetComponentsInChildren<Transform>(true))if(tr && tr!=root.transform&&(tr.name.StartsWith("Hit ")||tr.name.StartsWith("Flash ")))UnityEngine.Object.DestroyImmediate(tr.gameObject);
            foreach(var audio in root.GetComponentsInChildren<AudioSource>(true))UnityEngine.Object.DestroyImmediate(audio);
            foreach(var body in root.GetComponentsInChildren<Rigidbody>(true))body.isKinematic=true;
            foreach(var renderer in root.GetComponentsInChildren<Renderer>(true)) {
                var mapped=new List<Material>();foreach(var source in renderer.sharedMaterials) {
                    var material=new Material(Shader.Find("Hidden/HKD/ParticleBake"));
                    material.mainTexture=source?SavedTexture(source,"_MainTex"):null;
                    material.color=source?SavedColor(source):Color.white;
                    mapped.Add(material);materials.Add(material);
                }renderer.sharedMaterials=mapped.ToArray();
            }
            var systems=root.GetComponentsInChildren<ParticleSystem>(true);
            uint seed=147;foreach(var ps in systems){var main=ps.main;main.stopAction=ParticleSystemStopAction.None;ps.useAutoRandomSeed=false;ps.randomSeed=seed++;}
            foreach(var ps in systems){ps.Stop(false,ParticleSystemStopBehavior.StopEmittingAndClear);ps.Play(false);}
            camera.orthographic=true;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.clear;camera.nearClipPlane=.01f;camera.farClipPlane=1000;camera.targetTexture=rt;
            // Measure the whole deterministic clip first; every frame then has
            // the same scale and anchor (no visible breathing/jumping).
            float extent=.25f;
            for(int f=0;f<clip.frames;f++) {
                Step(root,systems,clip.loop,f);
                foreach(var r in root.GetComponentsInChildren<Renderer>())if(r.enabled&&r.gameObject.activeInHierarchy){var b=r.bounds;var c=b.center-root.transform.position;extent=Mathf.Max(extent,Mathf.Abs(c.x)+b.extents.x,Mathf.Abs(c.y)+b.extents.y);}
            }
            root.transform.position=Vector3.zero;foreach(var ps in systems){ps.Stop(false,ParticleSystemStopBehavior.StopEmittingAndClear);ps.Play(false);}
            camera.orthographicSize=Mathf.Min(extent*1.12f,40);
            for(int f=0;f<clip.frames;f++) {
                Step(root,systems,clip.loop,f);
                camera.transform.position=root.transform.position+new Vector3(0,0,-100);camera.transform.rotation=Quaternion.identity;
                camera.Render();RenderTexture.active=rt;frame.ReadPixels(new Rect(0,0,clip.cell,clip.cell),0,0);frame.Apply();
                // Store row zero at the top, matching Cocos SpriteFrame rects.
                sheet.SetPixels((f%clip.columns)*clip.cell,(clip.frames/clip.columns-1-f/clip.columns)*clip.cell,clip.cell,clip.cell,frame.GetPixels());
            }
            sheet.Apply();bool visible=false;foreach(var pixel in sheet.GetPixels32())if(pixel.a>0){visible=true;break;}
            if(!visible)throw new Exception("Empty particle capture: "+file+" (systems="+systems.Length+", active="+root.activeInHierarchy+")");
            File.WriteAllBytes(output,sheet.EncodeToPNG());
        } finally {
            RenderTexture.active=null;camera.targetTexture=null;rt.Release();
            UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(frame);UnityEngine.Object.DestroyImmediate(sheet);
            UnityEngine.Object.DestroyImmediate(root);UnityEngine.Object.DestroyImmediate(cameraObject);foreach(var mat in materials)UnityEngine.Object.DestroyImmediate(mat);
        }
    }
    static void Step(GameObject root,ParticleSystem[] systems,bool flight,int frame) {
        if(flight)root.transform.position=new Vector3((frame+1)*.15f,0,0);
        foreach(var ps in systems)ps.Simulate(1f/24,false,false,true);
    }
}
