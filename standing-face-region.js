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
  const values=[x,y,w,h,confidence,rightEyeX,rightEyeY,leftEyeX,leftEyeY];
  if(values.some(value=>!Number.isFinite(value)))throw new Error('FACE_REGION_DETECTION_NON_FINITE');
  if(w<=0||h<=0)throw new Error('FACE_REGION_DETECTION_SIZE_INVALID');

  const centerX=clamp((x+w*0.5)/contentWidth,0,1);
  const centerY=clamp((y+h*0.5)/contentHeight,0,1);
  const size=clamp(Math.sqrt(Math.max(0,(w/contentWidth)*(h/contentHeight))),Number.EPSILON,1);
  const angleRad=Math.atan2(leftEyeY-rightEyeY,leftEyeX-rightEyeX);

  return Object.freeze({
    frameId,
    timestampNS,
    present:true,
    centerX,
    centerY,
    size,
    angleRad:clamp(angleRad,-Math.PI,Math.PI),
    confidence:clamp(confidence,0,1),
  });
}

function validateFrameIdentity(frameId,timestampNS){
  if(!Number.isSafeInteger(frameId)||frameId<=0)throw new Error('FACE_REGION_FRAME_ID_INVALID');
  if(!Number.isSafeInteger(timestampNS)||timestampNS<=0)throw new Error('FACE_REGION_TIMESTAMP_INVALID');
}
