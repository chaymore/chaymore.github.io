// Shared deformation keeps the visible stipples and depth surface perfectly aligned.
export const deform = /* glsl */ `
  uniform vec3 mouth;
  uniform vec3 mouthCenter;
  vec3 speak(vec3 p) {
    float front = smoothstep(.15, .5, p.z);
    float across = 1. - smoothstep(.24, .58, abs(p.x-mouthCenter.x));
    float line = p.y - mouthCenter.y + .10 * (p.x-mouthCenter.x);
    float lipSpan = 1. - smoothstep(.15, .23, abs(p.x-mouthCenter.x));
    float blend = mix(.15, .009, lipSpan);
    float lower = 1. - smoothstep(-blend, blend, line);
    float neck = smoothstep(-.68, -.25, p.y);
    float weight = front * across * lower * neck;
    vec3 pivot = vec3(mouthCenter.x, mouthCenter.y+.26, .10);
    vec3 q = p-pivot;
    float angle = mouth.x * .23;
    vec3 rotated = vec3(q.x, cos(angle)*q.y-sin(angle)*q.z, sin(angle)*q.y+cos(angle)*q.z)+pivot;
    p = mix(p, rotated, weight);
    float lips = exp(-pow(line/.105, 2.)) * (1.-smoothstep(.15,.31,abs(p.x-mouthCenter.x))) * front;
    p.x = mix(p.x, mouthCenter.x + (p.x-mouthCenter.x)*(1.-mouth.y*.25+mouth.z*.18), lips);
    p.z += mouth.y * .042 * lips;
    p.y += mouth.x * .012 * lips * (1.-lower);
    return p;
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
  ${deform}
  void main() {
    vec3 p = speak(position);
    vec3 n = normalize(normalMatrix * normal);
    float light = max(0.,dot(n,normalize(vec3(-.35,.55,1.))));
    // Black pigment; light and texture affect mark area, never pigment color.
    ink = clamp(.08 + .78 * pow(1.-shade,1.45) + .14 * (1.-light), .06, 1.);
    float size = (.40 + 1.05 * pow(ink,.7)) * pointScale;
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
  void main() {
    if (visible < .5) discard;
    if (ascii > .5) {
      float index = min(7., floor(ink*8.));
      if(texture2D(glyphs,vec2((index+gl_PointCoord.x)/8.,1.-gl_PointCoord.y)).a < .45) discard;
    } else if(length(gl_PointCoord-.5) > radius) discard;
    gl_FragColor=vec4(0.,0.,0.,1.);
  }
`;
export const surfaceVertex = `${deform}\nvoid main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(speak(position),1.);}`;
