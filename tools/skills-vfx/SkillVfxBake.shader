Shader "Hidden/HKD/SkillVfxBake" {
 Properties {
  _MainTex("Texture",2D)="white"{} _Color("Tint",Color)=(1,1,1,1)
  _Additive("Additive source",Float)=0 _HueShift("Hue shift",Float)=0
  _ProceduralGlow("CFXR procedural glow",Float)=0 _Glow("Glow min max power limit",Vector)=(0,1,2,1)
  _DissolveTex("Authored dissolve",2D)="white"{} _OverlayTex("Authored overlay",2D)="white"{}
  _DissolveSettings("Enable alongUV invert smooth",Vector)=(0,0,0,.1) _DissolveScroll("Dissolve scroll",Vector)=(0,0,0,0)
  _DoubleDissolve("Double dissolve",Float)=0 _OverlayMode("Overlay mode",Float)=0 _OverlayBlend("Overlay blend",Float)=0 _OverlayScroll("Overlay scroll and scale",Vector)=(0,0,1,1)
  _Klaus("Klaus packed color/dissolve streams",Float)=0 _Grayscale("Neutral recolor",Float)=0 _Hdr("Authored HDR multiplier",Float)=1
  _Scroll("UV scroll",Vector)=(0,0,0,0) _HkdTime("Authored time",Float)=0
  _SingleChannel("Red channel opacity",Float)=0 _UseChannels("Authored channel mask",Float)=0
  _AlphaChannel("Opacity channel",Vector)=(0,0,0,1) _RgbChannel("Color channel",Vector)=(1,1,1,0)
  _WhiteColor("Ramp high",Color)=(1,1,1,1) _MidColor("Ramp middle",Color)=(.5,.5,.5,1) _LastColor("Ramp low",Color)=(0,0,0,1)
 }
 SubShader { Tags { "Queue"="Transparent" "RenderType"="Transparent" } Cull Off Lighting Off ZWrite Off
  Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
  Pass { CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "UnityCG.cginc"
   sampler2D _MainTex,_DissolveTex,_OverlayTex;float4 _MainTex_ST,_DissolveTex_ST;float4 _Color,_Scroll,_AlphaChannel,_RgbChannel,_WhiteColor,_MidColor,_LastColor,_Glow,_DissolveSettings,_DissolveScroll,_OverlayScroll;float _Additive,_HueShift,_HkdTime,_SingleChannel,_UseChannels,_Klaus,_Grayscale,_Hdr,_ProceduralGlow,_DoubleDissolve,_OverlayMode,_OverlayBlend;
   struct input { float4 vertex:POSITION;float4 uv:TEXCOORD0;float4 uv1:TEXCOORD1;float4 uv2:TEXCOORD2;float4 color:COLOR; };
   struct output { float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;float4 custom1:TEXCOORD1;float4 custom2:TEXCOORD2;float4 rawUV:TEXCOORD3;float4 color:COLOR; };
   output vert(input v){output o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=TRANSFORM_TEX(v.uv.xy,_MainTex)+_Scroll.xy*_HkdTime;o.color=v.color*_Color;o.custom1=v.uv1;o.custom2=v.uv2;o.rawUV=v.uv;return o;}
   float3 rgb2hsv(float3 c){float4 K=float4(0,-1.0/3,2.0/3,-1);float4 p=lerp(float4(c.bg,K.wz),float4(c.gb,K.xy),step(c.b,c.g));float4 q=lerp(float4(p.xyw,c.r),float4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y),e=1e-10;return float3(abs(q.z+(q.w-q.y)/(6*d+e)),d/(q.x+e),q.x);}
   float3 hsv2rgb(float3 c){float3 p=abs(frac(c.xxx+float3(0,2.0/3,1.0/3))*6-3);return c.z*lerp(float3(1,1,1),saturate(p-1),c.y);}
   float4 frag(output i):SV_Target {
    float4 tex=tex2D(_MainTex,i.uv);
    if(_SingleChannel>.5)tex=float4(1,1,1,tex.r);
    else if(_UseChannels>.5){float value=saturate(dot(tex,_RgbChannel));float3 ramp=value>.5?lerp(_MidColor.rgb,_WhiteColor.rgb,(value-.5)*2):lerp(_LastColor.rgb,_MidColor.rgb,value*2);tex=float4(ramp,saturate(dot(tex,_AlphaChannel)));}
    if(_ProceduralGlow>.5){float2 radial=i.uv-.5;float glow=pow(saturate(1-dot(radial,radial)*4),max(1,_Glow.z));tex=float4(1,1,1,clamp(lerp(_Glow.x,_Glow.y,glow),0,_Glow.w)*saturate(glow*30));}
    if(_OverlayMode>.5){float2 motion=frac(_HkdTime*_OverlayScroll.xy),uv=(i.rawUV.xy+i.rawUV.zw)*_OverlayScroll.zz+motion;float overlay=tex2D(_OverlayTex,uv).r;if(_OverlayMode>1.5){float2 second=(i.rawUV.xy+i.rawUV.wz)*_OverlayScroll.ww+motion;tex.a*=.5*(overlay+tex2D(_OverlayTex,second).r);}if(_OverlayBlend>1.5)tex.a*=overlay;else if(_OverlayBlend>.5)tex.rgb*=overlay;else tex*=overlay;}
    float4 c=tex*i.color;
    if(_Klaus>.5){float edge=clamp(i.custom1.y,0,.5),dissolve=smoothstep(edge,max(edge+.00001,1-edge),1-tex.g+lerp(-1+edge,1-edge,i.custom1.x));c.rgb=max(0,i.custom1.z)*lerp(i.color.rgb*tex.r,i.custom2.rgb,i.custom2.a*tex.b);c.a=i.color.a*saturate(tex.a-dissolve);}
    if(_DissolveSettings.x>.5){float2 duv=_DissolveSettings.y>.5?i.rawUV.xy*_DissolveTex_ST.xy+_DissolveTex_ST.zw+frac(_HkdTime*_DissolveScroll.xy):i.rawUV.xy;float value=tex2D(_DissolveTex,duv).r;if(_DissolveSettings.y>.5)value=i.rawUV.x+(value*2-1)*i.custom1.z;if(_DissolveSettings.z<.5)value=1-value;float smoothness=max(.0001,_DissolveSettings.w),time=lerp(-smoothness,1+smoothness,i.custom1.x);c.a*=smoothstep(value-smoothness,value+smoothness,time);if(_DoubleDissolve>.5&&i.custom1.w>0)c.a=saturate(c.a-smoothstep(value-smoothness,value+smoothness,time-i.custom1.w));}
    c.rgb*=_Hdr;
    if(_Grayscale>.5)c.rgb=dot(c.rgb,float3(.2126,.7152,.0722));
    if(abs(_HueShift)>0.00001){float3 h=rgb2hsv(max(c.rgb,0));h.x=frac(h.x+_HueShift);c.rgb=hsv2rgb(h);}
    if(_Additive>.5){float energy=max(c.r,max(c.g,c.b));c.a*=saturate(energy);c.rgb=energy>.00001?c.rgb/energy:0;}
    c.rgb=saturate(c.rgb);c.a=saturate(c.a);return c;
   }
  ENDCG }
 }
}
