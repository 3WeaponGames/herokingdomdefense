Shader "Hidden/HKD/SkillVfxBake" {
 Properties {
  _MainTex("Texture",2D)="white"{} _Color("Tint",Color)=(1,1,1,1)
  _Additive("Additive source",Float)=0 _HueShift("Hue shift",Float)=0
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
   sampler2D _MainTex;float4 _MainTex_ST;float4 _Color,_Scroll,_AlphaChannel,_RgbChannel,_WhiteColor,_MidColor,_LastColor;float _Additive,_HueShift,_HkdTime,_SingleChannel,_UseChannels;
   struct input { float4 vertex:POSITION;float2 uv:TEXCOORD0;float4 color:COLOR; };
   struct output { float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;float4 color:COLOR; };
   output vert(input v){output o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=TRANSFORM_TEX(v.uv,_MainTex)+_Scroll.xy*_HkdTime;o.color=v.color*_Color;return o;}
   float3 rgb2hsv(float3 c){float4 K=float4(0,-1.0/3,2.0/3,-1);float4 p=lerp(float4(c.bg,K.wz),float4(c.gb,K.xy),step(c.b,c.g));float4 q=lerp(float4(p.xyw,c.r),float4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y),e=1e-10;return float3(abs(q.z+(q.w-q.y)/(6*d+e)),d/(q.x+e),q.x);}
   float3 hsv2rgb(float3 c){float3 p=abs(frac(c.xxx+float3(0,2.0/3,1.0/3))*6-3);return c.z*lerp(float3(1,1,1),saturate(p-1),c.y);}
   float4 frag(output i):SV_Target {
    float4 tex=tex2D(_MainTex,i.uv);
    if(_SingleChannel>.5)tex=float4(1,1,1,tex.r);
    else if(_UseChannels>.5){float value=saturate(dot(tex,_RgbChannel));float3 ramp=value>.5?lerp(_MidColor.rgb,_WhiteColor.rgb,(value-.5)*2):lerp(_LastColor.rgb,_MidColor.rgb,value*2);tex=float4(ramp,saturate(dot(tex,_AlphaChannel)));}
    float4 c=tex*i.color;
    if(abs(_HueShift)>0.00001){float3 h=rgb2hsv(max(c.rgb,0));h.x=frac(h.x+_HueShift);c.rgb=hsv2rgb(h);}
    if(_Additive>.5){float energy=max(c.r,max(c.g,c.b));c.a*=saturate(energy);c.rgb=energy>.00001?c.rgb/energy:0;}
    c.rgb=saturate(c.rgb);c.a=saturate(c.a);return c;
   }
  ENDCG }
 }
}
