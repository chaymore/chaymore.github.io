import sys
import numpy as np, trimesh
from PIL import Image
from pathlib import Path
root=Path(sys.argv[1])
out=Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
mesh=trimesh.load(root/'head.obj',force='mesh',process=False)
faces=np.all(mesh.vertices[mesh.faces,:,][...,1]>.775,axis=1)
mesh=mesh.submesh([np.flatnonzero(faces)],append=True)
p,fi=trimesh.sample.sample_surface(mesh,65000,seed=37)
b=trimesh.triangles.points_to_barycentric(mesh.triangles[fi],p)
uv=(mesh.visual.uv[mesh.faces[fi]]*b[:,:,None]).sum(axis=1)
n=(mesh.vertex_normals[mesh.faces[fi]]*b[:,:,None]).sum(axis=1); n/=np.linalg.norm(n,axis=1)[:,None]
tex=np.array(Image.open(next((root/'unpacked/0').glob('*tex*'))).convert('RGB'))
c=tex[((1-uv[:,1])*(tex.shape[0]-1)).astype(int).clip(0,tex.shape[0]-1),(uv[:,0]*(tex.shape[1]-1)).astype(int).clip(0,tex.shape[1]-1)]/255
luma=c@np.array([.2126,.7152,.0722])
# Retain texture contrast for brows and hair; lift the darker window-facing profile.
luma=np.clip(luma**.65,.08,.98)
# Fade the short neck edge gently into the page.
rng=np.random.default_rng(42)
keep=rng.random(len(p))<np.clip((p[:,1]-.775)/.018,0,1)
p,n,luma=p[keep],n[keep],luma[keep]
center=(mesh.bounds[0]+mesh.bounds[1])/2
p=(p-center)*2.35/(mesh.bounds[1,1]-mesh.bounds[0,1])
# Align the reconstructed face toward the visitor.
a=-.16
rotation=np.array([[np.cos(a),0,np.sin(a)],[0,1,0],[-np.sin(a),0,np.cos(a)]])
p=p@rotation.T;n=n@rotation.T
packed=np.column_stack([p,n,luma]).astype('<f4')
packed.tofile(out/'portrait.bin')
vertices=(mesh.vertices-center)*2.35/(mesh.bounds[1,1]-mesh.bounds[0,1])
vertices=vertices@rotation.T
vertices[mesh.faces].astype('<f4').tofile(out/'surface.bin')
print('Points',len(p),'bytes',packed.nbytes,'bounds',p.min(0),p.max(0))
