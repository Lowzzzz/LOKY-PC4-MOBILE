import bpy
import sys
import os
import json
from mathutils import Vector

argv=sys.argv
args=argv[argv.index("--")+1:] if "--" in argv else []
if len(args)<2:
    raise RuntimeError("usage: inspect-owner3d-v3.py -- input.glb out_dir")
input_glb,out_dir=args[:2]
os.makedirs(out_dir,exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=input_glb)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes: raise RuntimeError("No mesh")
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

# Meshy imported character is inverted along detected vertical axis after bake.
# Anatomical fraction 0=feet,1=head.
def A(frac):
    return maxs[vert_i]-h*frac

def pt(lr_n,dep_n,a_frac):
    p=center.copy()
    p[lr_i]=center[lr_i]+lr_n*(w*0.5)
    p[depth_i]=center[depth_i]+dep_n*(d*0.5)
    p[vert_i]=A(a_frac)
    return Vector(p)

def look_at(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=700
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.color=(0.004,0.008,0.014)

# Determine both possible face directions. Render each.
cam_data=bpy.data.cameras.new('FaceCam')
cam=bpy.data.objects.new('FaceCam',cam_data)
bpy.context.collection.objects.link(cam)
scene.camera=cam
cam.data.lens=72

# lights
for name,lrn,dpn,af,energy,size in [
    ('Key',-0.8,-1.2,0.92,1300,3.0),
    ('Fill',0.8,-0.8,0.88,800,2.5),
    ('Rim',0.0,1.0,0.93,1100,2.5),
]:
    ld=bpy.data.lights.new(name,'AREA'); ld.energy=energy; ld.size=size
    lo=bpy.data.objects.new(name,ld); bpy.context.collection.objects.link(lo)
    lo.location=pt(lrn,dpn,af); look_at(lo,pt(0,0,0.90))

for label,sign in [('depth_neg',-1),('depth_pos',1)]:
    cam.location=pt(0,sign*4.1,0.90)
    look_at(cam,pt(0,0,0.90))
    scene.render.filepath=os.path.join(out_dir,f'face_{label}.png')
    bpy.ops.render.render(write_still=True)

# Full-body both sides too.
cam.data.lens=58
for label,sign in [('body_neg',-1),('body_pos',1)]:
    cam.location=pt(0,sign*3.3,0.52)
    look_at(cam,pt(0,0,0.52))
    scene.render.filepath=os.path.join(out_dir,f'{label}.png')
    bpy.ops.render.render(write_still=True)

# Head-region geometry stats for deterministic face masks.
verts=[]
for v in mesh.data.vertices:
    p=mesh.matrix_world@v.co
    af=(maxs[vert_i]-p[vert_i])/h
    if af>=0.80:
        verts.append([float(p[lr_i]),float(p[depth_i]),float(p[vert_i]),float(af)])
head_lr=[v[0] for v in verts]; head_dep=[v[1] for v in verts]; head_vert=[v[2] for v in verts]
report={
  'mesh':mesh.name,
  'vertices':len(mesh.data.vertices),
  'polygons':len(mesh.data.polygons),
  'axis':{'vertical':vert_i,'left_right':lr_i,'depth':depth_i,'vertical_sign':-1},
  'mins':mins,'maxs':maxs,'extents':ext,
  'head_vertex_count':len(verts),
  'head_bounds':{
    'lr':[min(head_lr),max(head_lr)],
    'depth':[min(head_dep),max(head_dep)],
    'vertical':[min(head_vert),max(head_vert)],
  },
}
with open(os.path.join(out_dir,'inspect_report.json'),'w') as f: json.dump(report,f,indent=2)
print('V3_INSPECT',json.dumps(report,separators=(',',':')))
