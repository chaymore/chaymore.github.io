// Analytic opening removes coarse scan triangles from the mouth interior.
export const aperture = /* glsl */ `
  uniform vec3 mouth;
  uniform vec3 mouthCenter;
  uniform vec4 mouthScan;
  varying vec3 portraitPosition;
  bool insideMouth() {
    float width = mouthScan.z*.68*(1.-mouth.y*.18+mouth.z*.12);
    float x = portraitPosition.x-mouthCenter.x;
    float y = portraitPosition.y-mouthCenter.y+.0275*mouth.x;
    vec2 uv = vec2(x/width, y/(.003+.0355*mouth.x));
    // Lens-shaped opening: tapers to the corners like real lips.
    return mouth.x>.03 && portraitPosition.z>.5 && abs(uv.x)<1. && abs(uv.y)<1.-uv.x*uv.x;
  }
`;

// Eye sockets measured from the scan (head space). The scan cannot capture eyes,
// so eyeballs are modeled here and the lids are an analytic almond per eye.
// Needs a blink uniform declared before it.
export const lids = /* glsl */ `
  uniform vec2 gaze;
  const vec3 eyeL = vec3(-.150,.486,.515);
  const vec3 eyeR = vec3(.288,.486,.515);
  const float eyeRadius = .084;
  const float eyeMidline = .069;
  // u runs -1..1 across the eye, positive toward the nose. y is height above the eye center.
  void eyeLids(vec2 p, out float u, out float y, out float upper, out float lower, out float upperOpen) {
    bool left = p.x < eyeMidline;
    vec3 c = left ? eyeL : eyeR;
    u = (left ? 1. : -1.) * (p.x - c.x) / .088;
    y = p.y - c.y;
    float s = max(0., 1. - u*u);
    // The upper lid rides with the gaze; the lower lid follows a little.
    upperOpen = .031 * pow(s, .7) * (1. + .12*u) + gaze.y * .03;
    lower = -.025 * pow(s, .9) * (1. - .12*u) + gaze.y * .008 + blink * .004;
    upper = mix(upperOpen, lower + .001, blink);
  }
`;

// Shared deformation keeps the visible stipples and depth surface perfectly aligned.
// mouthScan: the scan's own lip line (center x, center y, half width to the corners, slope).
// mouthCenter: where the mouth should sit. mouthTune: upper lip, lower lip, raw scan flag.
export const mouthFrame = /* glsl */ `
  uniform vec4 mouthScan;
  uniform vec4 mouthTune;
  // Moves the scan's lips onto a level line centered under the nose.
  vec3 levelMouth(vec3 p) {
    if (mouthTune.z > .5) return p;
    float dx = p.x - mouthScan.x;
    float w = exp(-pow((p.y - mouthScan.y)/.09, 2.)) * (1. - smoothstep(mouthScan.z*1.05, mouthScan.z*1.8, abs(dx))) * smoothstep(.15, .5, p.z);
    p.y -= mouthScan.w * dx * w;
    p.x += (mouthCenter.x - mouthScan.x) * w;
    p.y += (mouthCenter.y - mouthScan.y) * w;
    return p;
  }
`;

export const deform = /* glsl */ `
  uniform vec3 mouth;
  uniform vec3 mouthCenter;
  ${mouthFrame}
  uniform float blink;
  uniform float brow;
  const vec3 jawPivot = vec3(.05, .24, .10);
  float eyeMask(vec2 p, vec2 c, vec2 r) {
    return 1. - smoothstep(.78, 1.18, length((p - c) / r));
  }
  vec3 express(vec3 p) {
    float front = smoothstep(.38, .62, p.z);
    // Lid skin and the crease above it follow the closing lid a little.
    float leftLid = eyeMask(p.xy, vec2(-.150, .515), vec2(.095, .03));
    float rightLid = eyeMask(p.xy, vec2(.288, .515), vec2(.095, .03));
    p.y -= blink * .012 * max(leftLid, rightLid) * front;
    float leftBrow = eyeMask(p.xy, vec2(-.145, .590), vec2(.115, .028));
    float rightBrow = eyeMask(p.xy, vec2(.279, .564), vec2(.145, .032));
    float browZone = max(leftBrow, rightBrow) * front;
    p.y += brow * .018 * browZone;
    // A raised brow lifts the forehead skin just above it too.
    float leftForehead = eyeMask(p.xy, vec2(-.145, .66), vec2(.16, .07));
    float rightForehead = eyeMask(p.xy, vec2(.279, .64), vec2(.18, .07));
    p.y += max(brow, 0.) * .007 * max(leftForehead, rightForehead) * front;
    return p;
  }
  vec3 speak(vec3 p) {
    float front = smoothstep(.15, .5, p.z);
    p = levelMouth(p);
    float hw = mouthScan.z;
    float dx = p.x-mouthCenter.x;
    float across = 1. - smoothstep(.24, .58, abs(dx));
    float line = p.y - mouthCenter.y;
    float lipSpan = 1. - smoothstep(hw*.8, hw*1.2, abs(dx));
    float blend = mix(.15, .009, lipSpan);
    float lower = 1. - smoothstep(-blend, blend, line);
    float neck = smoothstep(-.62, -.36, p.y);
    float lips = exp(-pow(line/.105, 2.)) * (1.-smoothstep(hw*.8,hw*1.6,abs(dx))) * front;
    // The jaw hinges near the ears, so the chin swings down and slightly back
    // and the cheeks stretch with it. The lower lip adds a small drop of its own.
    float jaw = front * across * lower * neck * smoothstep(.1, .3, p.z);
    float angle = mouth.x * .075;
    vec3 r = p - jawPivot;
    vec3 swung = jawPivot + vec3(r.x, r.y*cos(angle) - r.z*sin(angle), r.y*sin(angle) + r.z*cos(angle));
    p = mix(p, swung, jaw);
    p.y -= mouth.x * .012 * lips * lower;
    p.x = mix(p.x, mouthCenter.x + dx*(1.-mouth.y*.18+mouth.z*.12), lips);
    p.z += mouth.y * .025 * lips;
    p.y += mouth.x * .008 * lips * (1.-lower);
    // Wide shapes pull the corners up and back and push the cheeks up.
    float corners = lips * smoothstep(hw*.4, hw*.9, abs(dx));
    p.y += mouth.z * .009 * corners;
    p.z -= mouth.z * .005 * corners;
    float cheeks = max(eyeMask(p.xy, vec2(mouthCenter.x-.2, .17), vec2(.12, .09)), eyeMask(p.xy, vec2(mouthCenter.x+.25, .17), vec2(.12, .09))) * front;
    p.y += mouth.z * .006 * cheeks;
    p.z += mouth.z * .004 * cheeks;
    return express(p);
  }
`;

export const pointVertex = /* glsl */ `
  attribute float shade;
  attribute float seed;
  uniform float pixelRatio;
  uniform float pointScale;
  uniform float ascii;
  varying float radius;
  varying float ink;
  varying float visible;
  varying vec3 portraitPosition;
  ${deform}
  ${lids}
  void main() {
    vec3 p = speak(position);
    portraitPosition = p;
    vec3 n = normalize(normalMatrix * normal);
    float light = max(0.,dot(n,normalize(vec3(-.35,.55,1.))));
    // Black pigment; light and texture affect mark area, never pigment color.
    ink = clamp(.08 + .78 * pow(1.-shade,1.45) + .14 * (1.-light), .06, 1.);
    float size = (.65 + .45 * pow(ink,.7)) * pointScale;
    // Eyes: the scan's smeared eye becomes pale sclera where the lids are open,
    // lid skin where a blink covers it, and a dark lash line along each lid edge.
    float u, y, upper, lower, upperOpen;
    eyeLids(position.xy, u, y, upper, lower, upperOpen);
    float eyeZone = smoothstep(.45,.55,position.z) * (1.-smoothstep(.95,1.2,abs(u))) * (1.-smoothstep(.05,.08,abs(y)));
    float inside = 1.-smoothstep(.9,1.,abs(u));
    float open = eyeZone * inside * smoothstep(lower, lower+.003, y) * (1.-smoothstep(upper-.003, upper, y));
    float covered = eyeZone * inside * step(upper, y) * (1.-smoothstep(upperOpen, upperOpen+.004, y)) * step(lower, y);
    float lash = eyeZone * (1.-smoothstep(.0035, .0085, abs(y-upper))) * (1.-smoothstep(.8, 1.05, abs(u)));
    float lowerLash = eyeZone * (1.-smoothstep(.002, .006, abs(y-lower))) * (1.-smoothstep(.6, .95, abs(u)));
    size = mix(size, .28 * size, open);
    size = mix(size, min(size, .85 * pointScale), covered);
    size = max(size, mix(size, 1.45 * pointScale, lash));
    size = max(size, mix(size, 1.0 * pointScale, lowerLash * (1.-blink)));
    // Lips: modeled on the leveled mouth frame, drawn with the scan's own stipples,
    // so they move with the jaw. A darker line closes them; the lower lip keeps a highlight.
    if (mouthTune.z < .5) {
      vec3 lp = levelMouth(position);
      float lu = (lp.x - mouthCenter.x) / mouthScan.z;
      float lv = lp.y - mouthCenter.y;
      float ls = max(0., 1. - lu*lu);
      float top = mouthTune.x * pow(ls, .55) * (1. - .22*exp(-pow(lu/.13, 2.)));
      float bot = -mouthTune.y * pow(ls, .7);
      float lipFront = smoothstep(.5, .6, lp.z);
      float lip = lipFront * (1.-smoothstep(.92, 1.02, abs(lu))) * smoothstep(bot-.002, bot+.002, lv) * (1.-smoothstep(top-.002, top+.002, lv));
      float edge = lip * (1.-smoothstep(.0, .005, min(abs(lv-top), abs(lv-bot))));
      float shine = lip * step(lv, 0.) * exp(-pow(((lv-bot)/max(-bot, .001) - .5)/.2, 2.)) * (1.-smoothstep(.15, .55, abs(lu)));
      float seam = lipFront * (1.-smoothstep(.0025, .006, abs(lv))) * (1.-smoothstep(.88, 1.04, abs(lu))) * (1.-smoothstep(.05, .2, mouth.x));
      float corner = lipFront * (1.-smoothstep(.0, .018, length(vec2((abs(lu)-1.)*mouthScan.z, lv))));
      size = mix(size, max(size, 1.75 * pointScale), lip);
      size = mix(size, 1.05 * pointScale, shine * .8);
      size = max(size, mix(size, 2.1 * pointScale, edge * .8));
      size = max(size, mix(size, 2.3 * pointScale, max(seam, corner * .8)));
    }
    visible = ascii > .5 && seed > .18 ? 0. : 1.;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.);
    gl_Position.z -= .0008 * gl_Position.w;
    gl_PointSize = mix(3.,6.5,ascii) * pixelRatio * pointScale;
    radius = size / (3. * pointScale) * .5;
  }
`;
export const pointFragment = /* glsl */ `
  uniform float ascii;
  uniform sampler2D glyphs;
  varying float radius;
  varying float ink;
  varying float visible;
  ${aperture}
  void main() {
    if (insideMouth()) discard;
    if (visible < .5) discard;
    if (ascii > .5) {
      float index = min(7., floor(ink*8.));
      if(texture2D(glyphs,vec2((index+gl_PointCoord.x)/8.,1.-gl_PointCoord.y)).a < .45) discard;
    } else if(length(gl_PointCoord-.5) > radius) discard;
    gl_FragColor=vec4(0.,0.,0.,1.);
  }
`;

// Stippled irises on modeled eyeballs. Each dot sits on a unit disk that is
// wrapped onto the eyeball around the gaze direction, then clipped by the lids.
export const eyeVertex = /* glsl */ `
  attribute vec2 disk;
  attribute float side;
  attribute float seed;
  uniform float pixelRatio;
  uniform float pointScale;
  uniform float ascii;
  varying float radius;
  varying float visible;
  uniform float blink;
  ${lids}
  void main() {
    bool left = side < .5;
    vec3 c = left ? eyeL : eyeR;
    // Both eyes converge slightly on a viewer in front of the face.
    vec2 g = gaze + vec2(left ? .02 : -.02, 0.);
    vec3 d = vec3(sin(g.x)*cos(g.y), sin(g.y), cos(g.x)*cos(g.y));
    vec3 e1 = normalize(cross(vec3(0.,1.,0.), d));
    vec3 e2 = cross(d, e1);
    vec3 dir = normalize(d + (e1*disk.x + e2*disk.y) * .5);
    vec3 p = c + eyeRadius * dir;
    float u, y, upper, lower, upperOpen;
    eyeLids(p.xy, u, y, upper, lower, upperOpen);
    float inside = step(abs(u), .95) * step(lower + .0012, y) * step(y, upper - .0012);
    vec3 nView = normalize(normalMatrix * dir);
    // A fixed catchlight toward the key light, on the portrait's right eye only (viewer's left).
    vec3 catchDir = normalize(normalize(vec3(-.35,.55,1.)) + vec3(0.,0.,1.));
    float glint = left ? step(.989, dot(nView, catchDir)) : 0.;
    float facing = step(.25, nView.z);
    visible = inside * (1.-glint) * facing * (1.-step(.5, ascii));
    float rho = length(disk);
    float fiber = .5 + .5*sin(atan(disk.y, disk.x)*19. + seed*6.2831);
    radius = rho < .36 ? .4 : rho > .84 ? .28 : mix(.1, .23, fiber);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    mv.z += .015;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 3. * pixelRatio * pointScale;
  }
`;
export const eyeFragment = /* glsl */ `
  varying float radius;
  varying float visible;
  void main() {
    if (visible < .5 || length(gl_PointCoord-.5) > radius) discard;
    gl_FragColor = vec4(0.,0.,0.,1.);
  }
`;

// Recessed, dotted mouth interior revealed when the lower lip separates:
// a pale band of upper teeth under the lip and a lighter tongue at the bottom.
export const cavityVertex = /* glsl */ `
  uniform vec3 mouth; uniform vec3 mouthCenter; uniform vec4 mouthScan; uniform float pixelRatio; uniform float pointScale;
  varying float keep;
  void main(){
    float width=mouthScan.z*.68*(1.-mouth.y*.18+mouth.z*.12);
    float lens=sqrt(max(0.,1.-position.x*position.x));
    float v=position.y*lens;
    float across=abs(position.x);
    float noise=fract(sin(dot(position.xy,vec2(12.9898,78.233)))*43758.5453);
    float n=v/max(lens*lens,.001);
    // Upper teeth sit just under a thin lip shadow.
    float teeth=step(.5,n)*step(n,.86)*step(across,.6)*step(.25,mouth.x);
    float tongue=step(n,-.45)*step(.55,noise);
    keep=1.-max(teeth,tongue);
    vec3 p=vec3(mouthCenter.x+position.x*width,mouthCenter.y-.0275*mouth.x+v*(.003+.0355*mouth.x),mouthCenter.z-.032-.038*(1.-position.z));
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    gl_PointSize=1.3*pixelRatio*pointScale;
  }
`;
export const cavityFragment = /* glsl */ `
  uniform vec3 mouth; varying float keep;
  void main(){if(mouth.x<.03||keep<.5||length(gl_PointCoord-.5)>.48)discard;gl_FragColor=vec4(0.,0.,0.,1.);}
`;

// White backdrop behind the mouth interior so the far side of the head never shows through.
export const cavityBackVertex = /* glsl */ `
  uniform vec3 mouth; uniform vec3 mouthCenter; uniform vec4 mouthScan;
  void main(){
    float width=mouthScan.z*.68*(1.-mouth.y*.18+mouth.z*.12);
    float lens=sqrt(max(0.,1.-position.x*position.x));
    vec3 p=vec3(mouthCenter.x+position.x*width*1.02,mouthCenter.y-.0275*mouth.x+position.y*lens*(.004+.0355*mouth.x),mouthCenter.z-.075);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
  }
`;
export const cavityBackFragment = /* glsl */ `
  uniform vec3 mouth;
  void main(){if(mouth.x<.03)discard;gl_FragColor=vec4(1.);}
`;

export const surfaceVertex = `${deform}
varying vec3 portraitPosition;
void main(){portraitPosition=speak(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(portraitPosition,1.);}`;
export const surfaceFragment = `${aperture}
void main(){if(insideMouth()) discard;gl_FragColor=vec4(1.);}`;
