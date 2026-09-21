import bpy
import sys
import os
import json
import math
from mathutils import Vector

def args_after_ddash():
    argv=sys.argv
    if "--" not in argv:
        raise RuntimeError("Expected -- input output out_dir")
    return argv[argv.index("--")+1:]

args=args_after_ddash()
if len(args)<3:
    raise RuntimeError("Usage: blender --background --python rig-owner3d-v1.py -- input.glb output.glb out_dir")
input_glb,output_glb,out_dir=args[:3]
os.makedirs(out_dir,exist_ok=True)

# Clean and import the exact approved Meshy realtime GLB.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=input_glb)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes:
    raise RuntimeError("No mesh imported")
mesh=max(meshes,key=lambda o: len(o.data.vertices))

# Bake Meshy's glTF import axis conversion into the mesh before skinning.
# This makes mesh vertices and the armature share one coordinate frame.
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active=mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Detect the anatomical axes from actual world-space extents.
corners=[mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
mins=[min(v[i] for v in corners) for i in range(3)]
maxs=[max(v[i] for v in corners) for i in range(3)]
ext=[maxs[i]-mins[i] for i in range(3)]
vert_i=max(range(3),key=lambda i: ext[i])
depth_i=min(range(3),key=lambda i: ext[i])
lr_i=({0,1,2}-{vert_i,depth_i}).pop()
centers=[(mins[i]+maxs[i])*0.5 for i in range(3)]
h=ext[vert_i]; w=ext[lr_i]; d=ext[depth_i]
vmin=mins[vert_i]
vmax=maxs[vert_i]
vertical_sign=-1  # Meshy head is toward min on Blender's detected vertical axis after import bake

def point(lr,dep,vert):
    p=[centers[0],centers[1],centers[2]]
    p[lr_i]=lr
    p[depth_i]=dep
    p[vert_i]=vert
    return tuple(p)

def V(frac):
    # frac=0 feet, frac=1 head
    return vmax-h*frac

def LR(norm):
    return centers[lr_i]+norm*(w*0.5)

DEP=centers[depth_i]

print("LOKY_RIG_AXES",json.dumps({
    "vertical_axis":vert_i,
    "left_right_axis":lr_i,
    "depth_axis":depth_i,
    "vertical_sign":vertical_sign,
    "mins":mins,
    "maxs":maxs,
    "extents":ext,
},separators=(',',':')))

# Build basic humanoid armature.
arm_data=bpy.data.armatures.new("LOKY_Armature")
arm=bpy.data.objects.new("LOKY_Armature",arm_data)
bpy.context.collection.objects.link(arm)
arm.show_in_front=True
bpy.context.view_layer.objects.active=arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

def add_bone(name,head,tail,parent=None):
    b=arm.data.edit_bones.new(name)
    b.head=head
    b.tail=tail
    b.use_deform=True
    if parent:
        b.parent=arm.data.edit_bones[parent]
        b.use_connect=False
    return b

hip=V(0.40)
sp1=V(0.52)
chest=V(0.68)
neck=V(0.80)
head_mid=V(0.90)

add_bone("root",point(LR(0),DEP,V(-0.02)),point(LR(0),DEP,hip))
add_bone("pelvis",point(LR(0),DEP,hip),point(LR(0),DEP,sp1),"root")
add_bone("spine",point(LR(0),DEP,sp1),point(LR(0),DEP,chest),"pelvis")
add_bone("chest",point(LR(0),DEP,chest),point(LR(0),DEP,neck),"spine")
add_bone("neck",point(LR(0),DEP,neck),point(LR(0),DEP,head_mid),"chest")
add_bone("head",point(LR(0),DEP,head_mid),point(LR(0),DEP,V(1.02)),"neck")

for side,sgn in (("L",-1),("R",1)):
    add_bone(f"upper_arm.{side}",point(LR(0.30*sgn),DEP,V(0.70)),point(LR(0.62*sgn),DEP,V(0.56)),"chest")
    add_bone(f"forearm.{side}",point(LR(0.62*sgn),DEP,V(0.56)),point(LR(0.82*sgn),DEP,V(0.43)),f"upper_arm.{side}")
    add_bone(f"hand.{side}",point(LR(0.82*sgn),DEP,V(0.43)),point(LR(0.84*sgn),DEP,V(0.34)),f"forearm.{side}")
    add_bone(f"thigh.{side}",point(LR(0.20*sgn),DEP,hip),point(LR(0.24*sgn),DEP,V(0.23)),"pelvis")
    add_bone(f"shin.{side}",point(LR(0.24*sgn),DEP,V(0.23)),point(LR(0.23*sgn),DEP,V(0.07)),f"thigh.{side}")
    add_bone(f"foot.{side}",point(LR(0.23*sgn),DEP,V(0.07)),point(LR(0.24*sgn),mins[depth_i]-0.10*d,V(0.01)),f"shin.{side}")

bpy.ops.object.mode_set(mode='OBJECT')

# Rig V3 SAFE skin:
# - lower body / feet / arms / torso remain mathematically rigid
# - only the neck/head transition deforms
# - at most two weights per vertex, normalized exactly
deform_names=[
    "pelvis","spine","chest","neck","head",
    "upper_arm.L","forearm.L","hand.L",
    "upper_arm.R","forearm.R","hand.R",
    "thigh.L","shin.L","foot.L",
    "thigh.R","shin.R","foot.R",
]
groups={name:mesh.vertex_groups.new(name=name) for name in deform_names}
weighted_counts={name:0 for name in deform_names}

def smooth01(x):
    x=max(0.0,min(1.0,x))
    return x*x*(3.0-2.0*x)

def addw(name,vid,wgt):
    if wgt<=1e-8:
        return
    groups[name].add([vid],float(wgt),'REPLACE')
    weighted_counts[name]+=1

for v in mesh.data.vertices:
    p=mesh.matrix_world @ v.co
    vert=p[vert_i]
    zn=(vmax-vert)/h if h else 0.5  # 0=feet, 1=head after Meshy axis correction

    if zn < 0.62:
        # Feet, legs, hips and lower torso: one rigid body influence.
        addw("pelvis",v.index,1.0)
    elif zn < 0.72:
        # Upper torso and shoulders stay rigid too.
        addw("chest",v.index,1.0)
    elif zn < 0.80:
        # Smooth chest -> neck transition.
        t=smooth01((zn-0.72)/0.08)
        addw("chest",v.index,1.0-t)
        addw("neck",v.index,t)
    elif zn < 0.88:
        # Smooth neck -> head transition.
        t=smooth01((zn-0.80)/0.08)
        addw("neck",v.index,1.0-t)
        addw("head",v.index,t)
    else:
        addw("head",v.index,1.0)

assigned=len(mesh.data.vertices)
if not weighted_counts["pelvis"] or not weighted_counts["head"]:
    raise RuntimeError(f"V3 weight regions invalid: {weighted_counts}")

# Link skin explicitly; do not depend on heat-weight solver.
world_before=mesh.matrix_world.copy()
mesh.parent=arm
mesh.matrix_parent_inverse=arm.matrix_world.inverted()
mesh.matrix_world=world_before
mod=mesh.modifiers.new(name="LOKY_Armature",type='ARMATURE')
mod.object=arm

# Rig V3 SAFE proof animation: head + neck only.
# Arms and everything below the shoulders must remain rigid during this phase.
scene=bpy.context.scene
scene.frame_start=1
scene.frame_end=60
animated=("head","neck")
for pb in arm.pose.bones:
    pb.rotation_mode='XYZ'

def reset_pose():
    for name in animated:
        arm.pose.bones[name].rotation_euler=(0,0,0)

def insert_pose(frame):
    for name in animated:
        arm.pose.bones[name].keyframe_insert(data_path="rotation_euler",frame=frame)

scene.frame_set(1)
reset_pose()
insert_pose(1)

scene.frame_set(30)
reset_pose()
arm.pose.bones["head"].rotation_euler[2]=math.radians(10)
arm.pose.bones["neck"].rotation_euler[2]=math.radians(-3)
insert_pose(30)

scene.frame_set(60)
reset_pose()
insert_pose(60)
scene.frame_set(1)

# Export standard skinned GLB.
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format='GLB',
    use_selection=True,
    export_apply=False,
    export_animations=True,
    export_yup=True,
    export_def_bones=False
)

report={
    "mesh":mesh.name,
    "vertex_count":len(mesh.data.vertices),
    "polygon_count":len(mesh.data.polygons),
    "axis":{"vertical":vert_i,"left_right":lr_i,"depth":depth_i,"vertical_sign":vertical_sign},
    "bounds":{"mins":mins,"maxs":maxs,"extents":ext},
    "armature":arm.name,
    "mesh_matrix_world":[list(row) for row in mesh.matrix_world],
    "armature_matrix_world":[list(row) for row in arm.matrix_world],
    "bones":[b.name for b in arm.data.bones],
    "assigned_vertices":assigned,
    "group_counts":weighted_counts,
    "rig_profile":"v3-headsafe-rigid-body",
    "output_glb":output_glb,
}
with open(os.path.join(out_dir,'rig_report.json'),'w',encoding='utf-8') as f:
    json.dump(report,f,indent=2)
print("LOKY_RIG_REPORT",json.dumps(report,separators=(',',':')))
