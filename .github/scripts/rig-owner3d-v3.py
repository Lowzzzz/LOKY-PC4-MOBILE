import bpy
import sys
import os
import json
import math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv=sys.argv
args=argv[argv.index("--")+1:] if "--" in argv else []
if len(args)<3:
    raise RuntimeError("usage: rig-owner3d-v3.py -- input.glb output.glb out_dir")
input_glb,output_glb,out_dir=args[:3]
os.makedirs(out_dir,exist_ok=True)

# ---------- Load pristine R8R13 geometry ----------
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=input_glb)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes: raise RuntimeError("No mesh imported")
mesh=max(meshes,key=lambda o:len(o.data.vertices))

bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active=mesh
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)

corners=[mesh.matrix_world@Vector(c) for c in mesh.bound_box]
mins=[min(v[i] for v in corners) for i in range(3)]
maxs=[max(v[i] for v in corners) for i in range(3)]
ext=[maxs[i]-mins[i] for i in range(3)]
vert_i=max(range(3),key=lambda i:ext[i])
depth_i=min(range(3),key=lambda i:ext[i])
lr_i=({0,1,2}-{vert_i,depth_i}).pop()
center=[(mins[i]+maxs[i])*0.5 for i in range(3)]
h=ext[vert_i]; w=ext[lr_i]; d=ext[depth_i]
assert (lr_i,vert_i,depth_i)==(0,1,2),(lr_i,vert_i,depth_i)

# Meshy after Blender import bake: anatomical head is min Y, feet max Y, face is negative Z.
def A(frac): return maxs[vert_i]-h*frac  # 0 feet -> 1 head
def LR(norm): return center[lr_i]+norm*(w*0.5)
def DEP(norm): return center[depth_i]+norm*(d*0.5)
def point(lrn,dep_n,af):
    p=center.copy();p[lr_i]=LR(lrn);p[depth_i]=DEP(dep_n);p[vert_i]=A(af);return tuple(p)

# ---------- Armature ----------
arm_data=bpy.data.armatures.new("LOKY_V3_Armature")
arm=bpy.data.objects.new("LOKY_V3_Armature",arm_data)
bpy.context.collection.objects.link(arm)
arm.show_in_front=True
bpy.context.view_layer.objects.active=arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

def bone(name,head,tail,parent=None,deform=True):
    b=arm.data.edit_bones.new(name)
    b.head=head;b.tail=tail;b.use_deform=deform
    if parent:
        b.parent=arm.data.edit_bones[parent];b.use_connect=False
    return b

# Core spine.
bone("root",point(0,0,-0.02),point(0,0,0.40),None,False)
bone("pelvis",point(0,0,0.40),point(0,0,0.50),"root")
bone("spine_01",point(0,0,0.50),point(0,0,0.58),"pelvis")
bone("spine_02",point(0,0,0.58),point(0,0,0.65),"spine_01")
bone("spine_03",point(0,0,0.65),point(0,0,0.71),"spine_02")
bone("chest",point(0,0,0.71),point(0,0,0.76),"spine_03")
bone("neck_01",point(0,0,0.76),point(0,0,0.81),"chest")
bone("neck_02",point(0,0,0.81),point(0,0,0.86),"neck_01")
bone("head",point(0,0,0.86),point(0,0,1.02),"neck_02")

# Arms + clavicles.
for side,sgn in (("L",-1),("R",1)):
    bone(f"clavicle.{side}",point(0.04*sgn,-0.02,0.73),point(0.30*sgn,-0.01,0.70),"chest",False)
    bone(f"upper_arm.{side}",point(0.30*sgn,-0.01,0.70),point(0.62*sgn,-0.02,0.56),f"clavicle.{side}")
    bone(f"forearm.{side}",point(0.62*sgn,-0.02,0.56),point(0.82*sgn,-0.04,0.43),f"upper_arm.{side}")
    bone(f"hand.{side}",point(0.82*sgn,-0.04,0.43),point(0.84*sgn,-0.10,0.34),f"forearm.{side}")
    # non-deform future finger controls already in hierarchy
    bone(f"thumb.{side}",point(0.82*sgn,-0.06,0.38),point(0.88*sgn,-0.16,0.34),f"hand.{side}",False)
    bone(f"fingers.{side}",point(0.84*sgn,-0.10,0.34),point(0.84*sgn,-0.15,0.29),f"hand.{side}",False)

# Legs + ankle/foot/toe controls.
for side,sgn in (("L",-1),("R",1)):
    bone(f"thigh.{side}",point(0.20*sgn,0,0.40),point(0.24*sgn,0,0.23),"pelvis")
    bone(f"shin.{side}",point(0.24*sgn,0,0.23),point(0.23*sgn,-0.02,0.075),f"thigh.{side}")
    bone(f"ankle.{side}",point(0.23*sgn,-0.02,0.075),point(0.23*sgn,-0.08,0.045),f"shin.{side}",False)
    bone(f"foot.{side}",point(0.23*sgn,-0.08,0.045),point(0.23*sgn,-0.28,0.018),f"ankle.{side}")
    bone(f"toe.{side}",point(0.23*sgn,-0.28,0.018),point(0.23*sgn,-0.48,0.012),f"foot.{side}")

bpy.ops.object.mode_set(mode='OBJECT')

deform_names=[
    "pelvis","spine_01","spine_02","spine_03","chest","neck_01","neck_02","head",
    "upper_arm.L","forearm.L","hand.L","upper_arm.R","forearm.R","hand.R",
    "thigh.L","shin.L","foot.L","toe.L","thigh.R","shin.R","foot.R","toe.R"
]
groups={n:mesh.vertex_groups.new(name=n) for n in deform_names}

# ---------- deterministic body weights ----------
def smooth(a,b,t):
    if b<=a:return 0.0
    x=max(0.0,min(1.0,(t-a)/(b-a)))
    return x*x*(3-2*x)

def norm_weights(items):
    s=sum(v for _,v in items)
    if s<=1e-12:return [(items[0][0],1.0)]
    return [(n,v/s) for n,v in items if v>1e-6]

def chain_weights(af,centers):
    # centers sorted ascending anatomical fraction
    if af<=centers[0][0]:return [(centers[0][1],1.0)]
    if af>=centers[-1][0]:return [(centers[-1][1],1.0)]
    for (a,na),(b,nb) in zip(centers,centers[1:]):
        if a<=af<=b:
            t=(af-a)/(b-a)
            t=t*t*(3-2*t)
            return [(na,1-t),(nb,t)]
    return [(centers[-1][1],1.0)]

assign_stats={n:0 for n in deform_names}
for v in mesh.data.vertices:
    p=mesh.matrix_world@v.co
    af=(maxs[vert_i]-p[vert_i])/h
    xn=(p[lr_i]-center[lr_i])/(w*0.5)
    dn=(p[depth_i]-center[depth_i])/(d*0.5)

    # head/neck
    if af>=0.80:
        items=chain_weights(af,[(0.80,"neck_02"),(0.86,"head"),(1.0,"head")])
    # lateral arms
    elif abs(xn)>=0.40 and 0.30<=af<=0.75:
        side="R" if xn>0 else "L"
        items=chain_weights(af,[
            (0.31,f"hand.{side}"),
            (0.43,f"hand.{side}"),
            (0.50,f"forearm.{side}"),
            (0.56,f"forearm.{side}"),
            (0.63,f"upper_arm.{side}"),
            (0.72,f"upper_arm.{side}")
        ])
    # legs own lower body
    elif af<0.42:
        side="R" if xn>0 else "L"
        # toe only on extreme lower/front shoe; otherwise foot
        if af<0.032 and dn<-0.18:
            items=[(f"toe.{side}",1.0)]
        else:
            items=chain_weights(af,[
                (0.00,f"foot.{side}"),
                (0.075,f"foot.{side}"),
                (0.15,f"shin.{side}"),
                (0.23,f"shin.{side}"),
                (0.32,f"thigh.{side}"),
                (0.42,f"thigh.{side}")
            ])
    else:
        items=chain_weights(af,[
            (0.42,"pelvis"),
            (0.50,"pelvis"),
            (0.54,"spine_01"),
            (0.59,"spine_02"),
            (0.65,"spine_03"),
            (0.72,"chest"),
            (0.76,"neck_01"),
            (0.80,"neck_02")
        ])

    items=norm_weights(items)
    for name,wgt in items:
        groups[name].add([v.index],float(wgt),'REPLACE')
        assign_stats[name]+=1

# ---------- face projection map ----------
scene=bpy.context.scene
cam_data=bpy.data.cameras.new("V3FaceMapCam")
cam=bpy.data.objects.new("V3FaceMapCam",cam_data)
bpy.context.collection.objects.link(cam)
cam.data.lens=72
cam.location=Vector(point(0,-4.1,0.90))
target=Vector(point(0,0,0.90))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera=cam
scene.render.resolution_x=700
scene.render.resolution_y=900
scene.render.resolution_percentage=100

proj=[]
for v in mesh.data.vertices:
    world=mesh.matrix_world@v.co
    ndc=world_to_camera_view(scene,cam,world)
    px=float(ndc.x*700)
    py=float((1-ndc.y)*900)
    af=(maxs[vert_i]-world[vert_i])/h
    dn=(world[depth_i]-center[depth_i])/(d*0.5)
    proj.append((px,py,af,dn))

def in_roi(i,x0,x1,y0,y1,af0=0.80,af1=1.01,front=-0.12):
    px,py,af,dn=proj[i]
    return x0<=px<=x1 and y0<=py<=y1 and af0<=af<=af1 and dn<=front

# ---------- face morph targets ----------
basis=mesh.shape_key_add(name="Basis")
morph_counts={}

def make_key(name,fn):
    key=mesh.shape_key_add(name=name)
    count=0
    for i,v in enumerate(mesh.data.vertices):
        co=key.data[i].co
        before=co.copy()
        fn(i,co)
        if (co-before).length>1e-7: count+=1
    morph_counts[name]=count
    if count<8: raise RuntimeError(f"Morph {name} too small: {count}")
    return key

# Eye regions: character L is viewer right, character R viewer left.
eye_defs={
    "L":(385,470,525,575),
    "R":(185,270,525,575),
}
iris_defs={
    "L":(405,445,538,568),
    "R":(205,245,538,568),
}
brow_defs={
    "L":(375,500,585,640),
    "R":(175,300,585,640),
}

for side in ("L","R"):
    x0,x1,y0,y1=eye_defs[side]
    cy=(y0+y1)*0.5
    def blink_fn(i,co,x0=x0,x1=x1,y0=y0,y1=y1,cy=cy):
        if in_roi(i,x0,x1,y0,y1,0.88,0.98,-0.10):
            px,py,af,dn=proj[i]
            # image vertical follows Blender Y; pull both lids toward eye center
            strength=max(0.0,1.0-abs(py-cy)/(0.5*(y1-y0)))
            direction=1.0 if py>cy else -1.0
            co[vert_i]+=direction*0.0105*strength
    make_key(f"Blink.{side}",blink_fn)

# Eye look morphs shift the iris patches laterally, small enough to preserve eyeball silhouette.
def eye_left(i,co):
    moved=False
    for side,(x0,x1,y0,y1) in iris_defs.items():
        if in_roi(i,x0,x1,y0,y1,0.89,0.97,-0.12):
            co[lr_i]-=0.0045;moved=True
def eye_right(i,co):
    for side,(x0,x1,y0,y1) in iris_defs.items():
        if in_roi(i,x0,x1,y0,y1,0.89,0.97,-0.12):
            co[lr_i]+=0.0045
make_key("EyeLookLeft",eye_left)
make_key("EyeLookRight",eye_right)

# Jaw open: only lower/front face. Blender Y positive is anatomically downward toward neck.
def jaw_open(i,co):
    if in_roi(i,235,435,235,415,0.80,0.91,-0.10):
        px,py,af,dn=proj[i]
        # stronger around chin/lower lip; taper near nose
        t=max(0.0,min(1.0,(415-py)/180.0))
        co[vert_i]+=0.014*t
        co[depth_i]+=0.0025*t
make_key("JawOpen",jaw_open)

# Lip controls.
def smile(i,co):
    if in_roi(i,265,405,340,405,0.84,0.92,-0.10):
        px,py,af,dn=proj[i]
        side=-1 if px<335 else 1
        edge=min(1.0,abs(px-335)/70.0)
        co[lr_i]+=side*0.0060*edge
        co[vert_i]-=0.0065*edge  # anatomical up
make_key("Smile",smile)

def pucker(i,co):
    if in_roi(i,270,400,340,405,0.84,0.92,-0.10):
        px,py,af,dn=proj[i]
        co[lr_i]+=(center[lr_i]-co[lr_i])*0.12
        co[depth_i]-=0.0060
make_key("Pucker",pucker)

def brow_raise(i,co):
    hit=False
    for side,(x0,x1,y0,y1) in brow_defs.items():
        if in_roi(i,x0,x1,y0,y1,0.92,0.99,-0.08):
            co[vert_i]-=0.0080
            hit=True
make_key("BrowRaise",brow_raise)

# ---------- Armature parenting ----------
world_before=mesh.matrix_world.copy()
mesh.parent=arm
mesh.matrix_parent_inverse=arm.matrix_world.inverted()
mesh.matrix_world=world_before
mod=mesh.modifiers.new(name="LOKY_V3_Armature",type='ARMATURE')
mod.object=arm

# ---------- QA animation ----------
scene.frame_start=1
scene.frame_end=90
for pb in arm.pose.bones:
    pb.rotation_mode='XYZ'

body_anim=[
    "head","neck_01","neck_02",
    "clavicle.L","clavicle.R","upper_arm.L","upper_arm.R",
    "forearm.L","forearm.R","hand.L","hand.R",
    "thigh.L","shin.L","ankle.L","foot.L",
]
def reset_pose():
    for n in body_anim:
        pb=arm.pose.bones.get(n)
        if pb:
            pb.rotation_euler=(0,0,0)
            pb.location=(0,0,0)
    for k in mesh.data.shape_keys.key_blocks:
        if k.name!="Basis": k.value=0.0

def key_all(frame):
    for n in body_anim:
        pb=arm.pose.bones.get(n)
        if pb: pb.keyframe_insert(data_path="rotation_euler",frame=frame)
    for k in mesh.data.shape_keys.key_blocks:
        if k.name!="Basis": k.keyframe_insert(data_path="value",frame=frame)

scene.frame_set(1);reset_pose();key_all(1)

# upper-body articulation
scene.frame_set(30);reset_pose()
arm.pose.bones["head"].rotation_euler[2]=math.radians(10)
arm.pose.bones["neck_02"].rotation_euler[2]=math.radians(-4)
arm.pose.bones["clavicle.L"].rotation_euler[1]=math.radians(5)
arm.pose.bones["clavicle.R"].rotation_euler[1]=math.radians(-5)
arm.pose.bones["upper_arm.L"].rotation_euler[1]=math.radians(16)
arm.pose.bones["upper_arm.R"].rotation_euler[1]=math.radians(-12)
arm.pose.bones["forearm.L"].rotation_euler[0]=math.radians(14)
arm.pose.bones["forearm.R"].rotation_euler[0]=math.radians(-10)
key_all(30)

# facial expression / talking
scene.frame_set(55);reset_pose()
mesh.data.shape_keys.key_blocks["JawOpen"].value=0.85
mesh.data.shape_keys.key_blocks["Smile"].value=0.55
mesh.data.shape_keys.key_blocks["BrowRaise"].value=0.40
mesh.data.shape_keys.key_blocks["EyeLookLeft"].value=0.45
mesh.data.shape_keys.key_blocks["Blink.L"].value=0.25
key_all(55)

# leg articulation with stable foot chain
scene.frame_set(75);reset_pose()
arm.pose.bones["thigh.L"].rotation_euler[1]=math.radians(8)
arm.pose.bones["shin.L"].rotation_euler[1]=math.radians(-13)
arm.pose.bones["ankle.L"].rotation_euler[1]=math.radians(5)
key_all(75)

scene.frame_set(90);reset_pose();key_all(90)
scene.frame_set(1)

# ---------- QA rendering ----------
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.color=(0.004,0.008,0.014)

# reusable lights
for name,lrn,dpn,af,energy,size in [
    ('Key',-0.9,-1.2,0.84,1200,4.0),
    ('Fill',0.9,-0.9,0.62,700,3.2),
    ('Rim',0.0,0.9,0.88,1100,3.5),
]:
    ld=bpy.data.lights.new(name,'AREA');ld.energy=energy;ld.size=size
    lo=bpy.data.objects.new(name,ld);bpy.context.collection.objects.link(lo)
    lo.location=Vector(point(lrn,dpn,af))
    lo.rotation_euler=(Vector(point(0,0,0.55))-lo.location).to_track_quat('-Z','Y').to_euler()

# full-body camera, face/front is depth negative. Roll 180 so anatomy is upright.
body_cam_data=bpy.data.cameras.new("V3BodyCam")
body_cam=bpy.data.objects.new("V3BodyCam",body_cam_data);bpy.context.collection.objects.link(body_cam)
body_cam.data.lens=58
body_cam.location=Vector(point(0,-3.35,0.52))
body_cam.rotation_euler=(Vector(point(0,0,0.52))-body_cam.location).to_track_quat('-Z','Y').to_euler()
body_cam.rotation_euler.rotate_axis('Z',math.pi)
scene.camera=body_cam
scene.render.resolution_x=700;scene.render.resolution_y=1050

for frame,name in [(1,"body_neutral.png"),(30,"body_articulation.png"),(75,"body_leg_pose.png")]:
    scene.frame_set(frame);bpy.context.view_layer.update()
    scene.render.filepath=os.path.join(out_dir,name);bpy.ops.render.render(write_still=True)

# face closeup
face_cam_data=bpy.data.cameras.new("V3FaceCam")
face_cam=bpy.data.objects.new("V3FaceCam",face_cam_data);bpy.context.collection.objects.link(face_cam)
face_cam.data.lens=72
face_cam.location=Vector(point(0,-4.1,0.90))
face_cam.rotation_euler=(Vector(point(0,0,0.90))-face_cam.location).to_track_quat('-Z','Y').to_euler()
face_cam.rotation_euler.rotate_axis('Z',math.pi)
scene.camera=face_cam
scene.render.resolution_x=700;scene.render.resolution_y=900
for frame,name in [(1,"face_neutral.png"),(55,"face_expression.png")]:
    scene.frame_set(frame);bpy.context.view_layer.update()
    scene.render.filepath=os.path.join(out_dir,name);bpy.ops.render.render(write_still=True)

# dedicated full blink render
scene.frame_set(1);reset_pose()
mesh.data.shape_keys.key_blocks["Blink.L"].value=1.0
mesh.data.shape_keys.key_blocks["Blink.R"].value=1.0
bpy.context.view_layer.update()
scene.render.filepath=os.path.join(out_dir,"face_blink.png");bpy.ops.render.render(write_still=True)
reset_pose();scene.frame_set(1)

# ---------- Export rig + morphs ----------
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True);arm.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format='GLB',
    use_selection=True,
    export_apply=False,
    export_animations=True,
    export_yup=True,
    export_def_bones=False,
    export_morph=True,
    export_morph_normal=False,
    export_morph_tangent=False
)

report={
  "version":"owner3d-v3-fullbody-face",
  "mesh":mesh.name,
  "vertex_count":len(mesh.data.vertices),
  "polygon_count":len(mesh.data.polygons),
  "axis":{"vertical":vert_i,"left_right":lr_i,"depth":depth_i,"vertical_sign":-1,"face_depth_sign":-1},
  "bounds":{"mins":mins,"maxs":maxs,"extents":ext},
  "bones":[b.name for b in arm.data.bones],
  "deform_bones":deform_names,
  "assign_stats":assign_stats,
  "morph_counts":morph_counts,
  "morph_names":[k.name for k in mesh.data.shape_keys.key_blocks if k.name!="Basis"],
  "output_glb":output_glb,
}
with open(os.path.join(out_dir,"v3_report.json"),"w") as f:json.dump(report,f,indent=2)
print("V3_RIG_REPORT",json.dumps(report,separators=(',',':')))
