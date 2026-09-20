import bpy
import sys
import os
from mathutils import Vector

argv=sys.argv
args=argv[argv.index("--")+1:] if "--" in argv else []
if len(args)<2:
    raise RuntimeError("Usage: render-owner3d-rig-v1.py -- rigged.glb out_dir")
input_glb,out_dir=args[:2]
os.makedirs(out_dir,exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=input_glb)

meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes:
    raise RuntimeError("No mesh")
mesh=max(meshes,key=lambda o: len(o.data.vertices))

corners=[mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
mins=[min(v[i] for v in corners) for i in range(3)]
maxs=[max(v[i] for v in corners) for i in range(3)]
ext=[maxs[i]-mins[i] for i in range(3)]
vert_i=max(range(3),key=lambda i: ext[i])
depth_i=min(range(3),key=lambda i: ext[i])
lr_i=({0,1,2}-{vert_i,depth_i}).pop()
center=[(mins[i]+maxs[i])*0.5 for i in range(3)]
h=ext[vert_i]; w=ext[lr_i]

def coord(lr,dep,vert):
    p=center.copy()
    p[lr_i]=lr
    p[depth_i]=dep
    p[vert_i]=vert
    return Vector(p)

def look_at(obj,point):
    direction=Vector(point)-obj.location
    obj.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()

scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=700
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.color=(0.005,0.012,0.018)

# Camera faces the shallow/depth axis.
cam_data=bpy.data.cameras.new('RigCam')
cam=bpy.data.objects.new('RigCam',cam_data)
bpy.context.collection.objects.link(cam)
scene.camera=cam
cam_pos=center.copy()
cam_pos[depth_i]=mins[depth_i]-3.0*h
cam_pos[vert_i]=mins[vert_i]+0.53*h
cam.location=Vector(cam_pos)
cam.data.lens=62
target=center.copy()
target[vert_i]=mins[vert_i]+0.52*h
look_at(cam,Vector(target))
cam.rotation_euler.rotate_axis('Z',3.141592653589793)

# Three-point lighting in detected anatomical basis.
lights=[
    ("Key",-0.9,-1.2,0.80,1200,4.0),
    ("Fill",0.9,-0.9,0.55,700,3.0),
    ("Rim",0.0,0.8,0.88,1100,3.5),
]
for name,lr_n,dep_n,v_n,energy,size in lights:
    ld=bpy.data.lights.new(name,'AREA')
    ld.energy=energy
    ld.shape='DISK'
    ld.size=size
    lo=bpy.data.objects.new(name,ld)
    bpy.context.collection.objects.link(lo)
    p=center.copy()
    p[lr_i]=center[lr_i]+lr_n*w
    p[depth_i]=center[depth_i]+dep_n*h
    p[vert_i]=mins[vert_i]+v_n*h
    lo.location=Vector(p)
    look_at(lo,Vector(target))

scene.frame_set(1)
scene.render.filepath=os.path.join(out_dir,'rig_neutral.png')
bpy.ops.render.render(write_still=True)

scene.frame_set(30)
bpy.context.view_layer.update()
scene.render.filepath=os.path.join(out_dir,'rig_pose.png')
bpy.ops.render.render(write_still=True)

print("RIG_RENDER_PASS",vert_i,lr_i,depth_i)
