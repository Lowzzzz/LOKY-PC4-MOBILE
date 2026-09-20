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

def point(lr,dep,vert):
    p=[centers[0],centers[1],centers[2]]
    p[lr_i]=lr
    p[depth_i]=dep
    p[vert_i]=vert
    return tuple(p)

def V(frac):
    return vmin+h*frac

def LR(norm):
    return centers[lr_i]+norm*(w*0.5)

DEP=centers[depth_i]

print("LOKY_RIG_AXES",json.dumps({
    "vertical_axis":vert_i,
    "left_right_axis":lr_i,
    "depth_axis":depth_i,
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

# Deterministic first-pass skin. This is a rig proof, not final smooth weighting.
deform_names=[
    "pelvis","spine","chest","neck","head",
    "upper_arm.L","forearm.L","hand.L",
    "upper_arm.R","forearm.R","hand.R",
    "thigh.L","shin.L","foot.L",
    "thigh.R","shin.R","foot.R",
]
groups={name:mesh.vertex_groups.new(name=name) for name in deform_names}
assign={name:[] for name in deform_names}

for v in mesh.data.vertices:
    p=mesh.matrix_world @ v.co
    vert=p[vert_i]
    lr=p[lr_i]
    zn=(vert-vmin)/h if h else 0.5
    xn=(lr-centers[lr_i])/(w*0.5) if w else 0.0

    # Head/hair first.
    if zn>=0.79:
        g="head"
    elif zn>=0.75:
        g="neck"
    # Legs/feet own the complete lower 40% before any arm rule can match.
    elif zn<0.40:
        side="R" if xn>0 else "L"
        if zn>=0.23:
            g=f"thigh.{side}"
        elif zn>=0.07:
            g=f"shin.{side}"
        else:
            g=f"foot.{side}"
    # Arms/hands: only outer lateral geometry above the leg boundary.
    elif abs(xn)>=0.42 and 0.40<=zn<=0.74:
        side="R" if xn>0 else "L"
        if zn>=0.57:
            g=f"upper_arm.{side}"
        elif zn>=0.47:
            g=f"forearm.{side}"
        else:
            g=f"hand.{side}"
    # Torso.
    elif zn<0.50:
        g="pelvis"
    elif zn<0.62:
        g="spine"
    elif zn<0.75:
        g="chest"
    else:
        g="neck"
    assign[g].append(v.index)

for name,indices in assign.items():
    if indices:
        groups[name].add(indices,1.0,'REPLACE')

assigned=sum(len(v) for v in assign.values())
if assigned!=len(mesh.data.vertices):
    raise RuntimeError(f"Unassigned vertices: {len(mesh.data.vertices)-assigned}")

# Link skin explicitly; do not depend on heat-weight solver.
world_before=mesh.matrix_world.copy()
mesh.parent=arm
mesh.matrix_parent_inverse=arm.matrix_world.inverted()
mesh.matrix_world=world_before
mod=mesh.modifiers.new(name="LOKY_Armature",type='ARMATURE')
mod.object=arm

# Add a tiny proof animation for validation only.
scene=bpy.context.scene
scene.frame_start=1
scene.frame_end=60
animated=("head","neck","upper_arm.L","upper_arm.R")
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
arm.pose.bones["head"].rotation_euler[2]=math.radians(12)
arm.pose.bones["neck"].rotation_euler[2]=math.radians(-4)
arm.pose.bones["upper_arm.L"].rotation_euler[1]=math.radians(9)
arm.pose.bones["upper_arm.R"].rotation_euler[1]=math.radians(-9)
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
    "axis":{"vertical":vert_i,"left_right":lr_i,"depth":depth_i},
    "bounds":{"mins":mins,"maxs":maxs,"extents":ext},
    "armature":arm.name,
    "mesh_matrix_world":[list(row) for row in mesh.matrix_world],
    "armature_matrix_world":[list(row) for row in arm.matrix_world],
    "bones":[b.name for b in arm.data.bones],
    "assigned_vertices":assigned,
    "group_counts":{name:len(indices) for name,indices in assign.items()},
    "output_glb":output_glb,
}
with open(os.path.join(out_dir,'rig_report.json'),'w',encoding='utf-8') as f:
    json.dump(report,f,indent=2)
print("LOKY_RIG_REPORT",json.dumps(report,separators=(',',':')))
