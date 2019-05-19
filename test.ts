import * as xmlbuilder from 'xmlbuilder';
import { awdNotation, BpmnElement, bpmnNotation } from './notationConfig.enum';
import { AwdBase64 } from './AWDbase64';
import * as xml2js from 'xml2js';
import { isArray } from 'util';

export class BpmnToAwd {
  modelName = 'tiwari_' + this.makeid(5);
  processId = this.uuidv4();

  convertBPMNToAWDXml(xml: string) {
    const bpmnJson = this.parseAWDXml(xml);
    const bpmnProcesses = bpmnJson['bpmn:definitions']['bpmn:process'];
    const shapeElements = bpmnJson['bpmn:definitions']['bpmndi:BPMNDiagram']['bpmndi:BPMNPlane']['bpmndi:BPMNShape'];
    const edgeElements = bpmnJson['bpmn:definitions']['bpmndi:BPMNDiagram']['bpmndi:BPMNPlane']['bpmndi:BPMNEdge'];
    const bpmnConnector = bpmnJson['bpmn:definitions']['bpmn:process']['bpmn:sequenceFlow'];

    let xmlProcessModel: any; let outerNode: any; let innerNode: any; let shapeModel: any;
    let flowobject: any;

    xmlProcessModel = xmlbuilder.create('processModel')
      .ele('xmlModel').ele('process').att('id', this.processId).ele('names')
      .ele('name', this.modelName).up().up().ele('workflowInfo').ele('screenName').up().up();
    outerNode = xmlProcessModel.ele('model').ele('pools').ele('pool').att('awd', 'Y').ele('lanes').ele('lane').ele('flowObjects');
    shapeModel = xmlProcessModel.up().up();
    innerNode = shapeModel.ele('rawXML').ele('process', { identifier: this.processId }).ele('name', this.modelName).up().ele('description')
      .up().ele('screenName').up().ele('rawXML').ele('shapes');
    for (const process in bpmnProcesses) {
      const taskList = bpmnProcesses[process];
      switch (process) {
        case bpmnNotation.start: {
          this.getFlowobject(taskList, outerNode, flowobject, bpmnConnector, awdNotation.start);
          break;
        }
        case bpmnNotation.task: {
          this.getFlowobject(taskList, outerNode, flowobject, bpmnConnector, awdNotation.activity);
          break;
        }
        case bpmnNotation.connector: {
          break;
        }
        case bpmnNotation.gateway: {
          this.getFlowobject(taskList, outerNode, flowobject, bpmnConnector, awdNotation.xOrGateway);
          break;
        }
        case bpmnNotation.intermediate: {
          this.getFlowobject(taskList, outerNode, flowobject, bpmnConnector, awdNotation.intermediate);
          break;
        }
        case bpmnNotation.end: {
          this.getFlowobject(taskList, outerNode, flowobject, bpmnConnector, awdNotation.end);
          break;
        }
        case '@': {
          break;
        }
        default: {
          // statements;
          break;
        }
      }
    }

    const shapeElementList = this.convertObjectToArray(shapeElements);
    shapeElementList.forEach(shapeElement => {
      const elementListName = shapeElement['@attributes'].bpmnElement.slice(0, -8);
      const elementId = shapeElement['@attributes'].bpmnElement;
      const boundAttribute = shapeElement['dc:Bounds']['@attributes'];

      switch (elementListName) {
        case BpmnElement.start: {
          this.getShapeDetail(innerNode, elementId, boundAttribute, bpmnConnector, edgeElements, awdNotation.start, shapeElementList);
          break;
        }
        case BpmnElement.task: {
          this.getShapeDetail(innerNode, elementId, boundAttribute, bpmnConnector, edgeElements, awdNotation.activity, shapeElementList);
          break;
        }
        case BpmnElement.gateway: {
          this.getShapeDetail(innerNode, elementId, boundAttribute, bpmnConnector, edgeElements, awdNotation.gateway, shapeElementList);
          break;
        }
        case BpmnElement.intermediate: {
          this.getShapeDetail(innerNode, elementId, boundAttribute, bpmnConnector, edgeElements, awdNotation.intermediate, shapeElementList);
          break;
        }
        case BpmnElement.connector: {
          break;
        }
        case BpmnElement.end: {
          this.getEndElementDetails(innerNode, elementId, boundAttribute, awdNotation.end);
          break;
        }
        default: {
          // statements;
          break;
        }

      }

    });

    const finalXml = xmlbuilder.create('ProcessViewRequest')
      .ele('saveModel').ele('process').ele('id', this.processId).up().ele('version', 0).up()
      .ele('name', this.modelName).up().ele('definition').raw((AwdBase64.encode(shapeModel.toString()))).up().up().up().root();
    finalXml.ele('userId', 'DSTSETUP');
    return finalXml.toString();
  }

  private parseAWDXml(xml: string): any {
    let awdJson: string;
    const parser = new xml2js.Parser({
      explicitRoot: true,
      explicitArray: false,
      attrkey: '@attributes'
    }).parseString(xml, function (err, result) {
      awdJson = result;
    });
    return awdJson;
  }

  private getFlowobject(tasks: any, outerNode: any, flowobject: any, bpmnconnector: any, awdtype: string) {
    const flowObjects = this.convertObjectToArray(tasks);
    flowObjects.forEach(flowObject => {
      let transitionNode;
      const flowObjectId = flowObject['@attributes'].id;
      const name = flowObject['@attributes'].name;
      flowobject = outerNode.ele('flowObject', { id: flowObjectId, type: awdtype })
        .ele('names')
        .element('name', name)
        .up()
        .up();
      transitionNode = flowobject.ele('transitions');
      if (flowObject['bpmn:outgoing']) {
        const transitions = this.convertObjectToArray(flowObject['bpmn:outgoing']);
        transitions.forEach(transition => {
          const conenctor = this.transformConnectors(bpmnconnector, transition);
          if (conenctor) {

            transitionNode.ele('transition', { id: conenctor.id, type: 'Sequence', to: conenctor.targetRef })
              .ele('names')
              .element('name', this.capitalize(conenctor.id))
              .end({ pretty: true });
          }
        });
      }
    });

  }
  // If input value is an array, below function will return same array
  // If input value is an object {object}, below function will return an array with object as child. [{object}]
  private convertObjectToArray(object) {
    let _object = [];
    if (isArray(object)) {
      _object = object;
    } else {
      _object.push(object);
    }
    return _object;
  }

  private transformConnectors(bpmnProcessesSources: any, conntectorId: string) {
    let attributes;
    const bpmnProcessesSourcesList = this.convertObjectToArray(bpmnProcessesSources);
    bpmnProcessesSourcesList.forEach(bpmnProcessesSource => {
      if (bpmnProcessesSource['@attributes'].id === conntectorId) {
        attributes = bpmnProcessesSource['@attributes'];
      }
    });
    return attributes;
  }

  //get source  and destination shapes points
  private getSourceDestination(bpmnShapes: any, id: string) {
    let sourceDestination: any;
    if (bpmnShapes) {
      bpmnShapes.forEach(bpmnShape => {
        if (bpmnShape['@attributes'].bpmnElement === id) {
          sourceDestination = bpmnShape['dc:Bounds'];
        }
      });
    }

    return sourceDestination;
  }

  // get Bpmnn 2.0 source and destination waypoints
  private getEdgeSourceDestination(sequenceFlowId: String, edgeElementList: any) {
    let waypoint;
    const edgeElementLists = this.convertObjectToArray(edgeElementList);
    if (edgeElementLists) {
      edgeElementLists.forEach(edgeElement => {
        if (edgeElement['@attributes'].bpmnElement === sequenceFlowId) {
          waypoint = edgeElement['di:waypoint'];
        }
      });
    }
    return waypoint;
  }

  private getShapeDetail(innerNode: any, elementId: string, bound: any, sequenceFlow: any, edgeElements: any, componentName: string, shapeElements: any) {

    let connectors;
    let componentNode;
    const elementListName = elementId.slice(0, -8);
    componentNode = innerNode.ele('component', { template: componentName })
      .ele('model').ele('description').up().ele('identifier', elementId).up()
      .ele('name', this.capitalize(elementListName)).up().ele('uid', elementId).up()
      .ele('inputs').up().up().ele('view').ele('height', bound.height).up()
      .ele('identifier', elementId).up().ele('shapeClass', 'com.dstawd.modeler.process.component.shape.' + elementListName).up()
      .ele('shapeImage', elementListName).up().ele('width', bound.width).up()
      .ele('x', bound.x).up().ele('y', bound.y).up().up();
    connectors = componentNode.ele('connectors');

    let sourceShape;
    let targetShape;
    if (sequenceFlow) {
      let component;
      let joints;
      const sequenceFlowList = this.convertObjectToArray(sequenceFlow);
      sequenceFlowList.forEach(sequenceFlow => {
        const sourceRef = sequenceFlow['@attributes'].sourceRef;
        const targetRef = sequenceFlow['@attributes'].targetRef;
        const id = sequenceFlow['@attributes'].id;

        sourceShape = this.getSourceDestination(shapeElements, sourceRef);
        targetShape = this.getSourceDestination(shapeElements, targetRef);

        if (sourceRef === elementId) {

          const processEdgeSourceDestination = this.getEdgeSourceDestination(id, edgeElements);
          const shapePoint = this.convertsourceDestinationJoints(processEdgeSourceDestination);
          component = connectors.ele('component', { template: 'Connector' })

            .ele('model').ele('description').up().ele('dstShapeID', targetRef).up()
            .ele('identifier', id).up().ele('name', elementListName).up().ele('srcShapeID', sourceRef).up()
            .ele('uid', id).up().up().ele('view').ele('connectorClass').up()
            .ele('defaultColor').up().ele('dstPoint').ele('x', shapePoint.dstPoint['@attributes'].x).up().ele('y', shapePoint.dstPoint['@attributes'].y).up()
            .up().ele('dstShape').ele('height', targetShape['@attributes'].height).up()
            .ele('identifier', targetRef).up().ele('shapeClass', 'com.dstawd.modeler.process.component.shape.' + elementListName).up()
            .ele('shapeImage', elementListName).up().ele('width', targetShape['@attributes'].width).up()
            .ele('x', targetShape['@attributes'].x).up().ele('y', targetShape['@attributes'].y).up().up()
            .ele('identifier', id).up().ele('padding').up()
            .ele('selectedColor').up().ele('srcPoint')
            .ele('x', shapePoint.srcPoint['@attributes'].x).up().ele('y', shapePoint.srcPoint['@attributes'].y).up()
            .up().ele('srcShape').ele('height', sourceShape['@attributes'].height).up()
            .ele('identifier', sourceRef).up().ele('shapeClass', 'com.dstawd.modeler.process.component.shape.' + elementListName).up()
            .ele('shapeImage', elementListName).up().ele('width', sourceShape['@attributes'].width).up()
            .ele('x', sourceShape['@attributes'].x).up().ele('y', sourceShape['@attributes'].y).up().up()
            .ele('thickness', '1').up().ele('vector').ele('x', 1).up().ele('y', 2).up().up();
          joints = component.ele('joints');
          if (shapePoint.jointPoint.length > 0) {
            this.createJoints(joints, shapePoint);
          }
        }
      });
    }
  }

  // create  Joints from Bpmn2.0 Waypoints into awd joints 
  private createJoints(jointsNode: any, shapepoints: any) {
    shapepoints.jointPoint.forEach(element => {
      jointsNode.ele('joint').ele('x', element['@attributes'].x).up()
        .ele('y', element['@attributes'].y)
        .end({ pretty: true });
    })
  }

  private capitalize(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  // convert  source, destination and joints points from BPMN 2.0 
  private convertsourceDestinationJoints(items: any) {
    const source = items[0];
    const destination = items[items.length - 1];
    const joints = items.slice(1, -1);
    const objOutput = {
      srcPoint: source,
      dstPoint: destination,
      jointPoint: joints
    };

    return objOutput;
  }

  private getEndElementDetails(innerNode: any, elementId: string, bound: any, shapeName: string) {
    const elementListName = elementId.slice(0, -8);
    innerNode.ele('component', { template: shapeName })
      .ele('model').ele('description').up().ele('identifier', elementId).up().ele('name', elementListName).up()
      .ele('uid', elementId).up().ele('inputs').up().up().ele('view')
      .ele('height', bound.height).up().ele('identifier', elementId).up().ele('shapeClass', 'com.dstawd.modeler.process.component.shape.' + elementListName).up()
      .ele('shapeImage', elementListName).up().ele('width', bound.width).up()
      .ele('x', bound.x).up().ele('y', bound.y).up().up().end({ pretty: true });
  }

  private uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }).toUpperCase();
  }

  private makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }
}

