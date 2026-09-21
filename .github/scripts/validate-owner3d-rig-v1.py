import json
import math
import struct
import sys
from pathlib import Path
import numpy as np

if len(sys.argv)<3:
    raise SystemExit("usage: validate-owner3d-rig-v1.py rig.glb report.json")

glb_path=Path(sys.argv[1])
report_path=Path(sys.argv[2])
raw=glb_path.read_bytes()
magic,version,total=struct.unpack_from("<4sII",raw,0)
assert magic==b"glTF" and version==2 and total==len(raw)

off=12
gltf=None
bin_chunk=None
while off<len(raw):
    ln,tp=struct.unpack_from("<II",raw,off); off+=8
    data=raw[off:off+ln]; off+=ln
    if tp==0x4E4F534A:
        gltf=json.loads(data.rstrip(b"\x00 ").decode("utf-8"))
    elif tp==0x004E4942:
        bin_chunk=data
assert gltf is not None and bin_chunk is not None

DT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NC={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT2":4,"MAT3":9,"MAT4":16}

def accessor(idx):
    a=gltf["accessors"][idx]
    bv=gltf["bufferViews"][a["bufferView"]]
    dtype=DT[a["componentType"]]
    n=NC[a["type"]]
    base=bv.get("byteOffset",0)+a.get("byteOffset",0)
    count=a["count"]
    stride=bv.get("byteStride")
    item=np.dtype(dtype).itemsize*n
    if not stride or stride==item:
        arr=np.frombuffer(bin_chunk,dtype=dtype,count=count*n,offset=base).reshape(count,n)
    else:
        arr=np.empty((count,n),dtype=dtype)
        for i in range(count):
            arr[i]=np.frombuffer(bin_chunk,dtype=dtype,count=n,offset=base+i*stride)
    if a.get("normalized"):
        info=np.iinfo(dtype)
        if np.issubdtype(dtype,np.unsignedinteger):
            arr=arr.astype(np.float32)/info.max
        else:
            arr=np.maximum(arr.astype(np.float32)/info.max,-1)
    return arr

skin=gltf["skins"][0]
joint_nodes=skin["joints"]
joint_names=[gltf["nodes"][i].get("name",f"joint_{k}") for k,i in enumerate(joint_nodes)]
name_to_joint={n:i for i,n in enumerate(joint_names)}
assert len(joint_nodes)>=18

prim=gltf["meshes"][0]["primitives"][0]
attrs=prim["attributes"]
for key in ("POSITION","JOINTS_0","WEIGHTS_0"):
    assert key in attrs,key
pos=accessor(attrs["POSITION"]).astype(np.float64)
joints=accessor(attrs["JOINTS_0"]).astype(np.int64)
weights=accessor(attrs["WEIGHTS_0"]).astype(np.float64)
assert len(pos)==len(joints)==len(weights)
assert np.max(joints)<len(joint_nodes)
ws=weights.sum(axis=1)
assert np.max(np.abs(ws-1.0))<1e-5, float(np.max(np.abs(ws-1.0)))

# Rig V3 SAFE anatomical / weight sanity.
# Exported glTF is Z-up: feet=min Z, head=max Z.
z=pos[:,2]
zmin=float(np.min(z)); zmax=float(np.max(z)); zh=zmax-zmin
dom_slot=np.argmax(weights,axis=1)
dom_joint=joints[np.arange(len(joints)),dom_slot]
dom_names=np.array([joint_names[int(i)] for i in dom_joint],dtype=object)

feet_zone=z <= zmin + zh*0.12
rigid_zone=z <= zmin + zh*0.70
head_zone=z >= zmax - zh*0.12

# Feet/lower body are intentionally locked to pelvis in V3.
assert np.all(dom_names[feet_zone]=="pelvis"), {
    "bad_feet":sorted(set(dom_names[feet_zone][dom_names[feet_zone]!="pelvis"].tolist()))
}
# Nothing below the neck transition may be controlled by moving neck/head bones.
assert not np.any(np.isin(dom_names[rigid_zone],["neck","head"])), "Moving head/neck weights leaked into rigid body"
# The top of the head must remain controlled by head.
assert np.mean(dom_names[head_zone]=="head") > 0.98

ibm=accessor(skin["inverseBindMatrices"]).astype(np.float64).reshape(-1,4,4)
ibm=np.transpose(ibm,(0,2,1))

parent={}
for i,n in enumerate(gltf["nodes"]):
    for ch in n.get("children",[]):
        parent[ch]=i

def quat_mat(q):
    x,y,z,w=q
    norm=x*x+y*y+z*z+w*w
    if norm<1e-15:
        return np.eye(4,dtype=np.float64)
    s=2.0/norm
    xx=x*x*s; yy=y*y*s; zz=z*z*s
    xy=x*y*s; xz=x*z*s; yz=y*z*s
    wx=w*x*s; wy=w*y*s; wz=w*z*s
    m=np.eye(4,dtype=np.float64)
    m[:3,:3]=[
        [1-yy-zz,xy-wz,xz+wy],
        [xy+wz,1-xx-zz,yz-wx],
        [xz-wy,yz+wx,1-xx-yy],
    ]
    return m

def trs(t,r,s):
    m=quat_mat(r)
    m[:3,:3]=m[:3,:3]@np.diag(s)
    m[:3,3]=t
    return m

base=[]
for n in gltf["nodes"]:
    if "matrix" in n:
        base.append(("matrix",np.array(n["matrix"],dtype=np.float64).reshape(4,4).T))
    else:
        base.append(("trs",(
            np.array(n.get("translation",[0,0,0]),dtype=np.float64),
            np.array(n.get("rotation",[0,0,0,1]),dtype=np.float64),
            np.array(n.get("scale",[1,1,1]),dtype=np.float64),
        )))

anim=gltf["animations"][0]
channels={}
for ch in anim["channels"]:
    node=ch["target"]["node"]
    path=ch["target"]["path"]
    sm=anim["samplers"][ch["sampler"]]
    channels[(node,path)]=(accessor(sm["input"]).reshape(-1).astype(np.float64),accessor(sm["output"]).astype(np.float64),sm.get("interpolation","LINEAR"))

def sample(times,vals,interp,t):
    if len(times)==1 or t<=times[0]:
        return vals[0]
    if t>=times[-1]:
        return vals[-1]
    i=int(np.searchsorted(times,t)-1)
    if interp=="STEP":
        return vals[i]
    u=(t-times[i])/(times[i+1]-times[i])
    v=vals[i]*(1-u)+vals[i+1]*u
    if vals.shape[1]==4:
        n=np.linalg.norm(v)
        if n>0: v=v/n
    return v

def globals_at(t):
    local=[]
    for i,n in enumerate(gltf["nodes"]):
        kind,data=base[i]
        if kind=="matrix":
            m=data.copy()
        else:
            tr,ro,sc=[x.copy() for x in data]
            if (i,"translation") in channels: tr=sample(*channels[(i,"translation")],t)
            if (i,"rotation") in channels: ro=sample(*channels[(i,"rotation")],t)
            if (i,"scale") in channels: sc=sample(*channels[(i,"scale")],t)
            m=trs(tr,ro,sc)
        local.append(m)
    glob=[None]*len(local)
    def calc(i):
        if glob[i] is not None:return glob[i]
        p=parent.get(i)
        glob[i]=calc(p)@local[i] if p is not None else local[i]
        return glob[i]
    for i in range(len(local)):calc(i)
    return glob

# Use the first keyed time and the midpoint of the 60-frame proof animation.
all_times=[]
for times,_,_ in channels.values():
    all_times.extend(times.tolist())
t0=min(all_times)
t1=(min(all_times)+max(all_times))*0.5

mesh_node=next(i for i,n in enumerate(gltf["nodes"]) if n.get("mesh")==0 and n.get("skin")==0)

def skin_positions(t):
    glob=globals_at(t)
    mesh_global=glob[mesh_node]
    inv_mesh=np.linalg.inv(mesh_global)
    ph=np.concatenate([pos,np.ones((len(pos),1),dtype=np.float64)],axis=1)
    out=np.zeros((len(pos),3),dtype=np.float64)
    for slot in range(4):
        w=weights[:,slot]
        nz=np.where(w>1e-9)[0]
        if not len(nz): continue
        jslot=joints[nz,slot]
        for ji in np.unique(jslot):
            ids=nz[jslot==ji]
            node=joint_nodes[int(ji)]
            jm=inv_mesh@glob[node]@ibm[int(ji)]
            moved=(jm@ph[ids].T).T[:,:3]
            out[ids]+=w[ids,None]*moved
    return out

p0=skin_positions(t0)
p1=skin_positions(t1)
delta=np.linalg.norm(p1-p0,axis=1)
dom_slot=np.argmax(weights,axis=1)
dom_joint=joints[np.arange(len(joints)),dom_slot]

group_stats={}
for name,ji in name_to_joint.items():
    m=dom_joint==ji
    if np.any(m):
        group_stats[name]={
            "count":int(np.sum(m)),
            "mean_delta":float(np.mean(delta[m])),
            "max_delta":float(np.max(delta[m])),
        }

# Hard guarantee: every vertex below the neck transition is motionless.
rigid_motion_max=float(np.max(delta[rigid_zone])) if np.any(rigid_zone) else 0.0
assert rigid_motion_max < 1e-7, rigid_motion_max

# Head/neck must actually move so this is a real rig, not a static export.
head_motion_max=float(np.max(delta[head_zone])) if np.any(head_zone) else 0.0
assert head_motion_max > 0.005, head_motion_max
assert group_stats.get("head",{}).get("max_delta",0.0) > 0.005

result={
    "rig_profile":"v3-headsafe-rigid-body",
    "orientation_weight_check":{
        "feet_vertices":int(np.sum(feet_zone)),
        "rigid_vertices":int(np.sum(rigid_zone)),
        "head_vertices":int(np.sum(head_zone)),
        "feet_pelvis_ratio":float(np.mean(dom_names[feet_zone]=="pelvis")),
        "head_head_ratio":float(np.mean(dom_names[head_zone]=="head")),
        "rigid_head_neck_leaks":int(np.sum(np.isin(dom_names[rigid_zone],["neck","head"]))),
    },
    "rigid_motion_max":rigid_motion_max,
    "head_motion_max":head_motion_max,
    "bytes":len(raw),
    "vertices":int(len(pos)),
    "triangles":int(gltf["accessors"][prim["indices"]]["count"]//3),
    "joints":joint_names,
    "animation_count":len(gltf.get("animations",[])),
    "sample_times":[float(t0),float(t1)],
    "group_stats":group_stats,
    "lower_body_static":True,
    "upper_body_moves":True,
}
report_path.write_text(json.dumps(result,indent=2),encoding="utf-8")
print("RIG_V3_HEADSAFE_PASS",json.dumps({
    "vertices":result["vertices"],
    "triangles":result["triangles"],
    "joints":len(joint_names),
    "rigid_motion_max":rigid_motion_max,
    "head_motion_max":head_motion_max,
    "feet_pelvis_ratio":result["orientation_weight_check"]["feet_pelvis_ratio"],
},separators=(',',':')))
