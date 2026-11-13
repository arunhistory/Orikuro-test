const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

export function createLostFaceRegionSample(frameId,timestampNS){
  validateFrameIdentity(frameId,timestampNS);
  return Object.freeze({
    frameId,
    timestampNS,
    present:false,
    centerX:0,
    centerY:0,
    size:0,
    angleRad:0,
    confidence:0,
    shape:Object.freeze([]),
    localShape:Object.freeze([]),
  });
}

export function adaptYuNetDetectionToFaceRegionSample(detection,frame){
  const frameId=Number(frame?.frameId);
  const timestampNS=Number(frame?.timestampNS);
  validateFrameIdentity(frameId,timestampNS);
  if(!detection)return createLostFaceRegionSample(frameId,timestampNS);

  const contentWidth=Number(frame?.contentWidth);
  const contentHeight=Number(frame?.contentHeight);
  if(!Number.isFinite(contentWidth)||!Number.isFinite(contentHeight)||contentWidth<=0||contentHeight<=0){
    throw new Error('FACE_REGION_FRAME_GEOMETRY_INVALID');
  }

  const x=Number(detection.x),y=Number(detection.y),w=Number(detection.width),h=Number(detection.height);
  const confidence=Number(detection.confidence);
  const rightEyeX=Number(detection.rightEyeX),rightEyeY=Number(detection.rightEyeY);
  const leftEyeX=Number(detection.leftEyeX),leftEyeY=Number(detection.leftEyeY);
  const noseX=Number(detection.noseX),noseY=Number(detection.noseY);
  const rightMouthX=Number(detection.rightMouthX),rightMouthY=Number(detection.rightMouthY);
  const leftMouthX=Number(detection.leftMouthX),leftMouthY=Number(detection.leftMouthY);
  const values=[
    x,y,w,h,confidence,
    rightEyeX,rightEyeY,leftEyeX,leftEyeY,noseX,noseY,
    rightMouthX,rightMouthY,leftMouthX,leftMouthY
  ];
  if(values.some(value=>!Number.isFinite(value)))throw new Error('FACE_REGION_DETECTION_NON_FINITE');
  if(w<=0||h<=0)throw new Error('FACE_REGION_DETECTION_SIZE_INVALID');

  const width=clamp(w/contentWidth,Number.EPSILON,1);
  const height=clamp(h/contentHeight,Number.EPSILON,1);
  const centerX=clamp((x+w*0.5)/contentWidth,0,1);
  const centerY=clamp((y+h*0.5)/contentHeight,0,1);
  const size=clamp(Math.sqrt(Math.max(0,width*height)),Number.EPSILON,1);
  const angleRad=Math.atan2(leftEyeY-rightEyeY,leftEyeX-rightEyeX);
  const point=(px,py)=>Object.freeze({
    x:clamp(px/contentWidth,0,1),
    y:clamp(py/contentHeight,0,1),
  });
  const shape=Object.freeze([
    point(rightEyeX,rightEyeY),
    point(leftEyeX,leftEyeY),
    point(noseX,noseY),
    point(rightMouthX,rightMouthY),
    point(leftMouthX,leftMouthY),
  ]);
  // Stable face-local coordinates: the zero reference is fixed and never
  // replaced by whichever pose happens to be detected after a loss.
  const localPoint=(px,py)=>Object.freeze({
    x:(px-x)/w,
    y:(py-y)/h,
  });
  const localShape=Object.freeze([
    localPoint(rightEyeX,rightEyeY),
    localPoint(leftEyeX,leftEyeY),
    localPoint(noseX,noseY),
    localPoint(rightMouthX,rightMouthY),
    localPoint(leftMouthX,leftMouthY),
  ]);
  if(localShape.some(({x:lx,y:ly})=>!Number.isFinite(lx)||!Number.isFinite(ly)))throw new Error('FACE_REGION_LOCAL_SHAPE_INVALID');

  return Object.freeze({
    frameId,
    timestampNS,
    present:true,
    centerX,
    centerY,
    width,
    height,
    size,
    angleRad:clamp(angleRad,-Math.PI,Math.PI),
    confidence:clamp(confidence,0,1),
    shape,
    localShape,
  });
}

function validateFrameIdentity(frameId,timestampNS){
  if(!Number.isSafeInteger(frameId)||frameId<=0)throw new Error('FACE_REGION_FRAME_ID_INVALID');
  if(!Number.isSafeInteger(timestampNS)||timestampNS<=0)throw new Error('FACE_REGION_TIMESTAMP_INVALID');
}
