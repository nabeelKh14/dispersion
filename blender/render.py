"""
DISPERSION — path-traced prism render.
Produces:
  frames/seq_####.png   looping dispersion sequence (for the WEBCSS video)
  stills/hero.png       poster / og image
Renders real glass with three slightly-dispersive prisms (R/G/B IOR offset)
so the rainbow is physically ray-traced, not faked.
"""
import bpy, bmesh, math, os, sys, mathutils
from mathutils import Vector

# Blender strips the "--" separator when it invokes a --python script, so
# sys.argv may or may not contain it depending on the invocation form.
# Parse the flags directly instead of trusting the separator to be there.
_argv = sys.argv[1:]
if "--" in _argv:
    _argv = _argv[_argv.index("--") + 1:]


def arg(k, d=None):
    for i, a in enumerate(_argv):
        if a == k and i + 1 < len(_argv):
            return _argv[i + 1]
        if a.startswith(k + "="):
            return a.split("=", 1)[1]
    return d

OUT      = arg("out", "/Users/openclaw/dispersion/blender/out")
RES_X    = int(arg("rx", 1920))
RES_Y    = int(arg("ry", 1080))
SAMPLES  = int(arg("samples", 96))
START    = int(arg("start", 1))
END      = int(arg("end", 288))
STILLS   = arg("stills", "")
ENGINE   = arg("engine", "CYCLES")   # CYCLES | EEVEE

os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)
os.makedirs(os.path.join(OUT, "stills"), exist_ok=True)

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.resolution_x = RES_X
scn.render.resolution_y = RES_Y
scn.render.resolution_percentage = 100
scn.render.fps = 24
scn.frame_start = START
scn.frame_end = END
scn.render.film_transparent = False
scn.render.image_settings.file_format = 'PNG'
scn.render.image_settings.color_mode = 'RGB'
scn.render.image_settings.color_depth = '8'
scn.render.use_persistent_data = True

if ENGINE == "CYCLES":
    scn.render.engine = 'CYCLES'
    scn.cycles.device = 'GPU'
    scn.cycles.samples = SAMPLES
    scn.cycles.use_denoising = True
    scn.cycles.max_bounces = 24
    scn.cycles.transmission_bounces = 20
    scn.cycles.glossy_bounces = 12
    scn.cycles.transparent_max_bounces = 24
    scn.cycles.blur_glossy = 1.0
    scn.cycles.caustics_refractive = True
    scn.cycles.caustics_reflective = True
    scn.cycles.use_light_tree = True
    # try metal GPU
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        print("CYCLES_DEVICE", prefs.compute_device_type, [d.name for d in prefs.devices])
    except Exception as e:
        print("CYCLES_DEVICE_FALLBACK", e)
else:
    scn.render.engine = 'BLENDER_EEVEE_NEXT'
    eevee = scn.eevee
    eevee.taa_render_samples = 64
    eevee.use_raytracing = True
    eevee.ray_tracing_options.use_denoise = True

scn.view_settings.view_transform = 'AgX'
scn.view_settings.look = 'AgX - Punchy'
scn.view_settings.exposure = 0.35

# ---------------------------------------------------------------- world: void
world = bpy.data.worlds.new("Void")
scn.world = world
world.use_nodes = True
wnt = world.node_tree
wnt.nodes.clear()
w_out = wnt.nodes.new("ShaderNodeOutputWorld")
w_bg = wnt.nodes.new("ShaderNodeBackground")
w_bg.inputs["Color"].default_value = (0.004, 0.006, 0.011, 1.0)
w_bg.inputs["Strength"].default_value = 1.0
wnt.links.new(w_bg.outputs["Background"], w_out.inputs["Surface"])

# ---------------------------------------------------------------- helpers
def glass_mat(name, ior, tint, rough=0.012, emit=None, emit_str=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    p.inputs["Base Color"].default_value = tint
    p.inputs["Roughness"].default_value = rough
    p.inputs["IOR"].default_value = ior
    p.inputs["Transmission Weight"].default_value = 1.0
    p.inputs["Metallic"].default_value = 0.0
    if emit is not None:
        p.inputs["Emission Color"].default_value = emit
        p.inputs["Emission Strength"].default_value = emit_str
    nt.links.new(p.outputs["BSDF"], out.inputs["Surface"])
    return m

def emissive_mat(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = color
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs["Emission"], out.inputs["Surface"])
    return m

def add_area(name, loc, rot, size, color, energy, shape='RECTANGLE', size_y=None):
    d = bpy.data.lights.new(name, 'AREA')
    d.shape = shape
    d.size = size
    if size_y is not None and shape == 'RECTANGLE':
        d.size_y = size_y
    d.color = color
    d.energy = energy
    o = bpy.data.objects.new(name, d)
    o.location = loc
    o.rotation_euler = rot
    scn.collection.objects.link(o)
    return o

def add_spot(name, loc, target, energy, color, angle=math.radians(28), blend=0.4):
    d = bpy.data.lights.new(name, 'SPOT')
    d.energy = energy
    d.color = color
    d.spot_size = angle
    d.spot_blend = blend
    d.shadow_soft_size = 0.25
    o = bpy.data.objects.new(name, d)
    o.location = loc
    dirv = Vector(target) - Vector(loc)
    o.rotation_euler = dirv.to_track_quat('-Z', 'Y').to_euler()
    scn.collection.objects.link(o)
    return o

def add_plane(name, loc, rot, sx, sy, mat):
    bpy.ops.mesh.primitive_plane_add(size=2, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx / 2, sy / 2, 1)
    o.data.materials.append(mat)
    return o

# ---------------------------------------------------------------- floor
floor_mat = bpy.data.materials.new("Floor")
floor_mat.use_nodes = True
nt = floor_mat.node_tree
nt.nodes.clear()
fo = nt.nodes.new("ShaderNodeOutputMaterial")
fp = nt.nodes.new("ShaderNodeBsdfPrincipled")
fp.inputs["Base Color"].default_value = (0.011, 0.013, 0.018, 1)
fp.inputs["Roughness"].default_value = 0.13
fp.inputs["Metallic"].default_value = 0.25
nt.links.new(fp.outputs["BSDF"], fo.inputs["Surface"])
add_plane("Floor", (0, 0, 0), (0, 0, 0), 60, 60, floor_mat)

# ---------------------------------------------------------------- the prism rig
# Three triangular prisms, each rotated a hair, with slightly different IOR.
# The result is a physically ray-traced spectral fan.
prism_grp = bpy.data.objects.new("PrismRig", None)
scn.collection.objects.link(prism_grp)

def make_prism(name, size, depth, mat, loc, rot):
    # equilateral triangular cross-section extruded
    verts = []
    r = size
    tri = []
    for i in range(3):
        a = math.radians(90 + i * 120)
        tri.append((math.cos(a) * r, math.sin(a) * r, -depth / 2))
    for i in range(3):
        a = math.radians(90 + i * 120)
        tri.append((math.cos(a) * r, math.sin(a) * r, depth / 2))
    faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(tri, [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    ob.location = loc
    ob.rotation_euler = rot
    scn.collection.objects.link(ob)
    return ob

# base pivot rotated so beam enters the face
PIVOT_ROT = (math.radians(90), 0, math.radians(-90))

m_r = glass_mat("GlassR", 1.470, (1.0, 0.30, 0.22, 1.0), rough=0.008)
m_g = glass_mat("GlassG", 1.487, (0.25, 1.0, 0.35, 1.0), rough=0.008)
m_b = glass_mat("GlassB", 1.512, (0.25, 0.40, 1.0, 1.0), rough=0.008)

p_r = make_prism("PrismR", 0.62, 0.5, m_r, (0, 0, 0), (0, 0, 0))
p_g = make_prism("PrismG", 0.62, 0.5, m_g, (0, 0, 0), (0, 0, 0))
p_b = make_prism("PrismB", 0.62, 0.5, m_b, (0, 0, 0), (0, 0, 0))
for p in (p_r, p_g, p_b):
    p.parent = prism_grp

prism_grp.rotation_euler = PIVOT_ROT
prism_grp.location = (0, 0, 1.55)

# ── the three prisms are offset in Y so light rakes through all three
p_r.location = (0, -0.052, 0)
p_g.location = (0,  0.000, 0)
p_b.location = (0,  0.052, 0)
# micro-rotation so each splits at a slightly different angle
p_r.rotation_euler = (0, 0, math.radians(-2.4))
p_g.rotation_euler = (0, 0, 0)
p_b.rotation_euler = (0, 0, math.radians(2.4))

# ---------------------------------------------------------------- incoming beam
beam_mat = emissive_mat("Beam", (1.0, 0.985, 0.95, 1.0), 26.0)
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.030, depth=9.0,
                                    location=(-4.5, 0, 1.55),
                                    rotation=(0, math.radians(90), 0))
beam = bpy.context.active_object
beam.name = "Beam"
beam.data.materials.append(beam_mat)
# taper the beam visually with a gradient along its length
bmesh_fade = beam.data
for v in bmesh_fade.vertices:
    v.co.x = v.co.x

# beam glow halo (additive, wider, dimmer)
halo_mat = bpy.data.materials.new("BeamHalo")
halo_mat.use_nodes = True
hnt = halo_mat.node_tree
hnt.nodes.clear()
ho = hnt.nodes.new("ShaderNodeOutputMaterial")
he = hnt.nodes.new("ShaderNodeEmission")
he.inputs["Color"].default_value = (0.75, 0.85, 1.0, 1.0)
he.inputs["Strength"].default_value = 1.6
hnt.links.new(he.outputs["Emission"], ho.inputs["Surface"])
halo_mat.blend_method = 'BLEND' if hasattr(halo_mat, 'blend_method') else 'BLEND'
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.115, depth=9.0,
                                    location=(-4.5, 0, 1.55),
                                    rotation=(0, math.radians(90), 0))
halo = bpy.context.active_object
halo.name = "BeamHalo"
halo.data.materials.append(halo_mat)

# ---------------------------------------------------------------- lighting
add_area("KeyTop",  (2.6, -2.4, 4.6), (math.radians(28), 0, math.radians(45)),
         3.2, (0.55, 0.72, 1.0), 220, size_y=1.1)
add_area("RimBack", (-3.2, 3.0, 2.4), (math.radians(72), 0, math.radians(-140)),
         2.4, (1.0, 0.55, 0.42), 160, size_y=0.8)
add_area("FillL",   (-3.0, -3.2, 1.4), (math.radians(80), 0, math.radians(-40)),
         3.0, (0.35, 0.55, 1.0), 70, size_y=2.0)
add_spot("CausticKick", (-1.0, 0.4, 5.2), (0, 0, 0.9), 900, (1.0, 0.96, 0.9),
         math.radians(20), 0.35)

# ---------------------------------------------------------------- camera
cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 58
cam_data.sensor_width = 36
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 2.8
cam = bpy.data.objects.new("Cam", cam_data)
scn.collection.objects.link(cam)
scn.camera = cam
cam.location = (3.05, -3.45, 2.15)
target = Vector((0.0, 0.0, 1.45))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_data.dof.focus_distance = (target - cam.location).length

# ---------------------------------------------------------------- animation
# Loop: the rig rotates 360deg over exactly `LOOP` frames; camera does a slow
# parallax arc that also returns to start so the clip loops seamlessly.
LOOP = END - START + 1
for f in range(START, END + 1):
    t = (f - START) / LOOP
    prism_grp.rotation_euler = (
        math.radians(90),
        0,
        math.radians(-90) + t * math.tau,
    )
    # camera slow arc
    a = t * math.tau
    rad = 4.85
    cam.location = (
        math.cos(a) * rad * 0.62 + 0.55,
        math.sin(a) * rad * 0.72 - 0.25,
        2.05 + math.sin(t * math.tau) * 0.30,
    )
    tg = Vector((0.0, 0.0, 1.50 + math.sin(t * math.tau) * 0.06))
    cam.rotation_euler = (tg - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.dof.focus_distance = (tg - cam.location).length
    scn.frame_set(f)

# ---------------------------------------------------------------- output
if STILLS:
    scn.render.filepath = os.path.join(OUT, "stills", STILLS)
    scn.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    print("STILL_DONE", scn.render.filepath)
else:
    scn.render.filepath = os.path.join(OUT, "frames", "seq_")
    bpy.ops.render.render(animation=True)
    print("ANIM_DONE")
