import json,struct,sys
from pathlib import Path
import numpy as np

if len(sys.argv)<3: raise SystemExit("validate-owner3d-v3.py rig.glb report.json")
p=Path(sys.argv[1]);out=Path(sys.argv[2]);raw=p.read_bytes()
magic,ver,total=struct.unpack_from("<4sII",raw,0)
assert magic==b"glTF" and ver==2 and total==len(raw)
off=12;g=None;b=None
while off<len(raw):
    ln,tp=struct.unpack_from("<II",raw,off);off+=8;data=raw[off:off+ln];off+=ln
    if tp==0x4E4F534A:g=json.loads(data.rstrip(b"\x00 ").decode())
    elif tp==0x004E4942:b=data
assert g and b

DT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NC={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT2":4,"MAT3":9,"MAT4":16}
def acc(idx):
    a=g["accessors"][idx];bv=g["bufferViews"][a["bufferView"]];dt=DT[a["componentType"]];n=NC[a["type"]]
    base=bv.get("byteOffset",0)+a.get("byteOffset",0);count=a["count"];stride=bv.get("byteStride");item=np.dtype(dt).itemsize*n
    if not stride or stride==item:return np.frombuffer(b,dtype=dt,count=count*n,offset=base).reshape(count,n)
    arr=np.empty((count,n),dtype=dt)
    for i in range(count):arr[i]=np.frombuffer(b,dtype=dt,count=n,offset=base+i*stride)
    return arr

assert len(g.get("skins",[]))==1
skin=g["skins"][0]
joint_names=[g["nodes"][i].get("name","") for i in skin["joints"]]
required_bones=[
  "pelvis","spine_01","spine_02","spine_03","chest","neck_01","neck_02","head",
  "clavicle.L","clavicle.R","upper_arm.L","upper_arm.R","forearm.L","forearm.R","hand.L","hand.R",
  "thigh.L","thigh.R","shin.L","shin.R","ankle.L","ankle.R","foot.L","foot.R","toe.L","toe.R"
]
for n in required_bones: assert n in joint_names,n

prim=g["meshes"][0]["primitives"][0]
attrs=prim["attributes"]
for k in ("POSITION","JOINTS_0","WEIGHTS_0"):assert k in attrs,k
P=acc(attrs["POSITION"]).astype(float);J=acc(attrs["JOINTS_0"]).astype(int);W=acc(attrs["WEIGHTS_0"]).astype(float)
assert len(P)==167761
assert g["accessors"][prim["indices"]]["count"]==540000
assert np.max(J)<len(joint_names)
assert np.max(np.abs(W.sum(1)-1.0))<1e-4

# Geographic safety: no upper-body bones may dominate feet, no leg bones may dominate head.
z=P[:,2];zmin,zmax=float(z.min()),float(z.max());zh=zmax-zmin
dom=J[np.arange(len(J)),np.argmax(W,axis=1)]
dom_names=np.array([joint_names[i] for i in dom],dtype=object)
bottom=z<zmin+0.12*zh;top=z>zmax-0.12*zh
upper=["head","neck_01","neck_02","chest","spine_03","upper_arm.L","forearm.L","hand.L","upper_arm.R","forearm.R","hand.R"]
legs=["thigh.L","shin.L","ankle.L","foot.L","toe.L","thigh.R","shin.R","ankle.R","foot.R","toe.R"]
bottom_bad=np.isin(dom_names[bottom],upper)
top_bad=np.isin(dom_names[top],legs)
assert int(bottom_bad.sum())==0,int(bottom_bad.sum())
assert int(top_bad.sum())==0,int(top_bad.sum())

# Morph targets and names.
targets=prim.get("targets",[])
names=(g["meshes"][0].get("extras") or {}).get("targetNames",[])
required_morphs=["Blink.L","Blink.R","EyeLookLeft","EyeLookRight","JawOpen","Smile","Pucker","BrowRaise"]
assert len(targets)>=len(required_morphs),(len(targets),names)
for n in required_morphs: assert n in names,(n,names)
morph_stats={}
for name in required_morphs:
    ti=names.index(name);target=targets[ti];assert "POSITION" in target,name
    D=acc(target["POSITION"]).astype(float)
    mag=np.linalg.norm(D,axis=1);changed=mag>1e-6
    n=int(changed.sum());assert n>=8,(name,n)
    # every facial morph must stay in upper 28% of character
    assert float(z[changed].min())>zmin+0.70*zh,(name,float(z[changed].min()),zmin,zmax)
    morph_stats[name]={"changed":n,"max_delta":float(mag.max()),"mean_delta":float(mag[changed].mean())}

# Animation must include skin and morph channels.
assert len(g.get("animations",[]))>=1
paths=[]
for anim in g["animations"]:
    for ch in anim.get("channels",[]):paths.append(ch.get("target",{}).get("path"))
assert "rotation" in paths
assert "weights" in paths

res={
 "bytes":len(raw),"vertices":len(P),"triangles":180000,
 "joints":joint_names,"joint_count":len(joint_names),
 "morphs":names,"morph_stats":morph_stats,
 "bottom_upper_leaks":int(bottom_bad.sum()),"top_leg_leaks":int(top_bad.sum()),
 "animation_paths":sorted(set(paths)),
}
out.write_text(json.dumps(res,indent=2)+"\n")
print("V3_VALIDATE_PASS",json.dumps({"joints":len(joint_names),"morphs":len(names),"bottomLeaks":0,"topLeaks":0}))
