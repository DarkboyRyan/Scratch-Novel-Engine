import {
  ENGINE_METHODS,
  type EngineInvocation,
} from '../../shared/engineProtocol';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isEngineInvocation(
  value: unknown,
): value is EngineInvocation {
  if (
    !isObject(value) ||
    !ENGINE_METHODS.includes(value.method as never) ||
    !isObject(value.params)
  ) {
    return false;
  }

  const params = value.params;
  const hasString = (key: string) => typeof params[key] === 'string';

  switch (value.method) {
    case 'project.create':
      return params.name === undefined || hasString('name');
    case 'project.ensure':
    case 'project.get':
      return Object.keys(params).length === 0;
    case 'scene.add':
      return params.name === undefined || hasString('name');
    case 'scene.rename':
      return hasString('sceneId') && hasString('name');
    case 'scene.delete':
      return hasString('sceneId');
    case 'dialogue.add':
      return (
        hasString('sceneId') &&
        (params.afterNodeId === undefined ||
          params.afterNodeId === null ||
          hasString('afterNodeId')) &&
        (params.speaker === undefined || hasString('speaker')) &&
        (params.text === undefined || hasString('text'))
      );
    case 'dialogue.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasString('speaker') &&
        hasString('text')
      );
    case 'dialogue.delete':
      return hasString('sceneId') && hasString('nodeId');
    case 'dialogue.move':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.direction === -1 || params.direction === 1)
      );
    default:
      return false;
  }
}
