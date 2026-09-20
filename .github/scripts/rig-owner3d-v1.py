import bpy
import sys
import os
import json
import math
from mathutils import Vector

def arg_after_ddash():
    argv=sys.argv
    if "--" not in argv:
        raise RuntimeError("Expected -- input output out_dir")
    return argv[argv.index("--")+1:]

args=arg_after_ddash()
if len(args)<3:
    raise RuntimeError("Usage: blender --background --python rig-owner3d-v1.py -- input.glb output.glb out_dir")
input_glb, output_glb, out_dir=args[:3]
os.makedirs(out_dir,exist_ok=True)

# Clean scene.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Import the exact approved 180K GLB.
bpy.ops.import_scene.gltf(filepath=input_glb)
mesh_objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not mesh_objects:
    raise RuntimeError("No mesh imported")
mesh=max(mesh_objects,key=lambda o: len(o.data.vertices))

# World-space bounds.
corners=[mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
xmin=min(v.x for v in corners); xmax=max(v.x for v in corners)
ymin=min(v.y for v in corners); ymax=max(v.y for v in corners)
zmin=min(v.z for v in corners); zmax=max(v.z for v in corners)
cx=(xmin+xmax)*0.5; cy=(ymin+ymax)*0.5
h=zmax-zmin; w=xmax-xmin

def Z(frac):
    return zmin+h*frac

# Build a compact humanoid armature matched to the actual Meshy bounds.
arm_data=bpy.data.armatures.new("LOKY_Armature")
arm=bpy.data.objects.new("LOKY_Armature",arm_data)
bpy.context.collection.objects.link(arm)
arm.show_in_front=True
bpy.context.view_layer.objects.active=arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

def bone(name,head,tail,parent=None,deform=True):
    b=arm.data.edit_bones.new(name)
    b.head=head
    b.tail=tail
    b.use_deform=deform
    if parent:
        b.parent=arm.data.edit_bones[parent]
        b.use_connect=False
    return b

hip_z=Z(0.40)
spine1_z=Z(0.53)
chest_z=Z(0.68)
neck_z=Z(0.80)
head_mid_z=Z(0.90)

bone("root",(cx,cy,zmin-0.06*h),(cx,cy,hip_z),deform=False)
bone("pelvis",(cx,cy,hip_z),(cx,cy,spine1_z),"root")
bone("spine",(cx,cy,spine1_z),(cx,cy,chest_z),"pelvis")
bone("chest",(cx,cy,chest_z),(cx,cy,neck_z),"spine")
bone("neck",(cx,cy,neck_z),(cx,cy,head_mid_z),"chest")
bone("head",(cx,cy,head_mid_z),(cx,cy,zmax+0.02*h),"neck")

shoulder_x=w*0.19
elbow_x=w*0.37
wrist_x=w*0.43
shoulder_z=Z(0.70)
elbow_z=Z(0.55)
wrist_z=Z(0.43)
hand_z=Z(0.36)

for side,sgn in (("L",-1),("R",1)):
    sx=cx+sgn*shoulder_x
    ex=cx+sgn*elbow_x
    wx=cx+sgn*wrist_x
    bone(f"upper_arm.{side}",(sx,cy,shoulder_z),(ex,cy,elbow_z),"chest")
    bone(f"forearm.{side}",(ex,cy,elbow_z),(wx,cy,wrist_z),f"upper_arm.{side}")
    bone(f"hand.{side}",(wx,cy,wrist_z),(wx,cy,hand_z),f"forearm.{side}")

leg_x=w*0.16
knee_z=Z(0.23)
ankle_z=Z(0.07)
foot_z=Z(0.015)
for side,sgn in (("L",-1),("R",1)):
    lx=cx+sgn*leg_x
    bone(f"thigh.{side}",(lx,cy,hip_z),(lx,cy,knee_z),"pelvis")
    bone(f"shin.{side}",(lx,cy,knee_z),(lx,cy,ankle_z),f"thigh.{side}")
    bone(f"foot.{side}",(lx,cy,ankle_z),(lx,ymin-0.10*(ymax-ymin),foot_z),f"shin.{side}")

bpy.ops.object.mode_set(mode='OBJECT')

# Parent mesh to armature. First try Blender heat weights; fall back to envelope.
for o in bpy.context.selected_objects:
    o.select_set(False)
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active=arm
weight_mode="AUTO"
try:
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
except Exception as exc:
    weight_mode="ENVELOPE"
    print("AUTO_WEIGHTS_FAILED",repr(exc))
    # Clear partial parenting/groups before fallback.
    for o in mesh_objects:
        o.parent=None
        for vg in list(o.vertex_groups):
            o.vertex_groups.remove(vg)
        for mod in list(o.modifiers):
            if mod.type=='ARMATURE':
                o.modifiers.remove(mod)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active=arm
    bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')

# Validate skin setup.
arm_mods=[m for m in mesh.modifiers if m.type=='ARMATURE']
if not arm_mods:
    raise RuntimeError("Armature modifier missing after parenting")
groups=[g.name for g in mesh.vertex_groups]
if len(groups)<8:
    raise RuntimeError(f"Too few vertex groups: {len(groups)}")

# Export neutral rigged GLB.
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
    export_yup=True
)

# Set up render scene for visual QA.
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT' if bpy.app.version >= (4,0,0) else 'BLENDER_EEVEE'
scene.render.resolution_x=640
scene.render.resolution_y=960
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.color=(0.008,0.015,0.022)

def look_at(obj,point):
    direction=Vector(point)-obj.location
    obj.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()

cam_data=bpy.data.cameras.new('RigCam')
cam=bpy.data.objects.new('RigCam',cam_data)
bpy.context.collection.objects.link(cam)
scene.camera=cam
cam.location=(cx,cy-3.1*h,Z(0.53))
cam.data.lens=58
look_at(cam,(cx,cy,Z(0.52)))

for name,loc,energy,size in [
    ('Key',(cx-w*1.8,cy-1.6*h,Z(0.85)),1200,4.0),
    ('Fill',(cx+w*1.6,cy-1.1*h,Z(0.60)),700,3.0),
    ('Rim',(cx,cy+1.0*h,Z(0.90)),1000,3.0),
]:
    ld=bpy.data.lights.new(name,'AREA')
    ld.energy=energy
    ld.shape='DISK'
    ld.size=size
    lo=bpy.data.objects.new(name,ld)
    bpy.context.collection.objects.link(lo)
    lo.location=loc
    look_at(lo,(cx,cy,Z(0.50)))

# Neutral render.
scene.render.filepath=os.path.join(out_dir,'rig_neutral.png')
bpy.ops.render.render(write_still=True)

# Small QA pose: head turn + slight arm offset + knee shift.
for pb in arm.pose.bones:
    pb.rotation_mode='XYZ'
head=arm.pose.bones.get('head')
if head: head.rotation_euler[2]=math.radians(8)
neck=arm.pose.bones.get('neck')
if neck: neck.rotation_euler[2]=math.radians(-3)
ua=arm.pose.bones.get('upper_arm.L')
if ua: ua.rotation_euler[1]=math.radians(7)
ub=arm.pose.bones.get('upper_arm.R')
if ub: ub.rotation_euler[1]=math.radians(-7)
scene.render.filepath=os.path.join(out_dir,'rig_pose.png')
bpy.ops.render.render(write_still=True)

report={
    "weight_mode":weight_mode,
    "mesh":mesh.name,
    "vertex_count":len(mesh.data.vertices),
    "polygon_count":len(mesh.data.polygons),
    "bounds":{"xmin":xmin,"xmax":xmax,"ymin":ymin,"ymax":ymax,"zmin":zmin,"zmax":zmax},
    "armature":arm.name,
    "bones":[b.name for b in arm.data.bones],
    "vertex_groups":groups,
    "output_glb":output_glb,
}
with open(os.path.join(out_dir,'rig_report.json'),'w',encoding='utf-8') as f:
    json.dump(report,f,indent=2)

print("LOKY_RIG_REPORT",json.dumps(report,separators=(',',':')))
