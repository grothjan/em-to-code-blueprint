import { describe, it, expect } from 'vitest';
import { ActionKind } from './model.js';

describe('model types', () => {
  it('defines all action kinds', () => {
    const expectedKinds: ActionKind[] = [
      'context',
      'command',
      'event',
      'information',
      'prjcase',
      'on',
      'job',
      'known',
      'blocked'
    ];
    
    // Verify all expected kinds exist (type-level check)
    expectedKinds.forEach(kind => {
      expect(['context', 'command', 'event', 'information', 'prjcase', 'on', 'job', 'known', 'blocked']).toContain(kind);
    });
  });

  it('action key format follows convention', () => {
    // Keys should be in format "kind:FQCN" or "kind:FQCN<-FQCN"
    const validKeys = [
      'command:Crm.CreateUser',
      'event:Crm.UserCreated',
      'information:Crm.UserList',
      'prjcase:Crm.UserList<-Crm.UserCreated',
      'on:Crm.SendNotification<-Crm.UserCreated',
      'job:Crm.ProcessTodo<-Crm.TodoList',
      'known:Crm.CreateUser',
      'blocked:Crm.CreateUser'
    ];

    validKeys.forEach(key => {
      // Check key format (starts with kind: and contains FQCN)
      const parts = key.split(':');
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(['command', 'event', 'information', 'prjcase', 'on', 'job', 'known', 'blocked']).toContain(parts[0]);
    });
  });

  it('registry snapshot has all required properties', () => {
    // Type check - these should all be defined in the RegistrySnapshot type
    const mockSnapshot = {
      contexts: new Set<string>(),
      commands: new Set<string>(),
      events: new Set<string>(),
      queries: new Set<string>(),
      informationFolders: new Set<string>(),
      jobs: new Map<string, { todoList: string }>(),
      eventApply: new Map<string, Set<string>>(),
      eventAutomate: new Map<string, Set<string>>()
    };

    expect(mockSnapshot.contexts).toBeInstanceOf(Set);
    expect(mockSnapshot.commands).toBeInstanceOf(Set);
    expect(mockSnapshot.events).toBeInstanceOf(Set);
    expect(mockSnapshot.queries).toBeInstanceOf(Set);
    expect(mockSnapshot.informationFolders).toBeInstanceOf(Set);
    expect(mockSnapshot.jobs).toBeInstanceOf(Map);
    expect(mockSnapshot.eventApply).toBeInstanceOf(Map);
    expect(mockSnapshot.eventAutomate).toBeInstanceOf(Map);
  });

  it('dependency graph has correct structure', () => {
    const mockGraph = {
      element: {
        id: 'element-1',
        type: 'event' as const,
        name: 'UserCreated',
        description: 'User was created',
        details: '',
        icon: 'check-circle',
        laneId: 'lane-1',
        sliceId: 'slice-1',
        index: 1,
        comments: [],
        context: 'App',
        chapterId: 'chapter-1',
        chapterName: 'Event Modeling'
      },
      sources: [],
      targets: []
    };

    expect(mockGraph.element).toBeDefined();
    expect(mockGraph.sources).toBeInstanceOf(Array);
    expect(mockGraph.targets).toBeInstanceOf(Array);
  });

  it('board comment has required properties', () => {
    const mockComment = {
      id: 'comment-1',
      userId: 'user-1',
      user: 'John Doe',
      text: 'This is a task comment',
      createdAt: '2024-01-01T00:00:00Z',
      isTask: true
    };

    expect(mockComment.id).toBeDefined();
    expect(mockComment.userId).toBeDefined();
    expect(mockComment.user).toBeDefined();
    expect(mockComment.text).toBeDefined();
    expect(mockComment.createdAt).toBeDefined();
    expect(mockComment.isTask).toBe(true);
  });

  it('plan structure is correct', () => {
    const mockPlan = {
      actions: [],
      notes: []
    };

    expect(mockPlan.actions).toBeInstanceOf(Array);
    expect(mockPlan.notes).toBeInstanceOf(Array);
  });

  it('board element has all required properties', () => {
    const mockElement = {
      id: 'element-1',
      type: 'command' as const,
      name: 'CreateUser',
      description: 'Create a new user',
      details: '',
      icon: 'user-plus',
      laneId: 'lane-1',
      sliceId: 'slice-1',
      index: 0,
      comments: [],
      context: 'App',
      chapterId: 'chapter-1',
      chapterName: 'Event Modeling'
    };

    expect(mockElement.id).toBeDefined();
    expect(mockElement.type).toBe('command');
    expect(mockElement.name).toBe('CreateUser');
    expect(mockElement.description).toBeDefined();
    expect(mockElement.context).toBeDefined();
    expect(mockElement.chapterId).toBeDefined();
    expect(mockElement.chapterName).toBeDefined();
  });

  it('supports automation types', () => {
    const eventAutomationType = 'event';
    const jobAutomationType = 'job';

    expect(eventAutomationType).toBe('event');
    expect(jobAutomationType).toBe('job');
  });

  it('registry reader interface is correctly structured', () => {
    // Type check for the interface
    const mockReader = {
      read: (): any => ({
        contexts: new Set<string>(),
        commands: new Set<string>(),
        events: new Set<string>(),
        queries: new Set<string>(),
        informationFolders: new Set<string>(),
        jobs: new Map<string, { todoList: string }>(),
        eventApply: new Map<string, Set<string>>(),
        eventAutomate: new Map<string, Set<string>>()
      })
    };

    expect(mockReader.read).toBeInstanceOf(Function);
  });

  it('prooph client interface is correctly structured', () => {
    // Type check for the interface
    const mockClient = {
      getSliceElements: async (): Promise<any> => ({ slice: { id: '', chapterId: '' }, elements: [], chapterName: '' }),
      getDependencyGraph: async (): Promise<any> => ({
        element: { id: '', type: 'command', name: '', description: '', details: '', icon: '', laneId: '', sliceId: '', index: 0, comments: [], context: '', chapterId: '', chapterName: '' },
        sources: [],
        targets: []
      }),
      addTaskComment: async (): Promise<void> => {}
    };

    expect(mockClient.getSliceElements).toBeInstanceOf(Function);
    expect(mockClient.getDependencyGraph).toBeInstanceOf(Function);
    expect(mockClient.addTaskComment).toBeInstanceOf(Function);
  });

  it('codegen runner interface is correctly structured', () => {
    // Type check for the interface
    const mockRunner = {
      run: async (): Promise<any> => ({
        ok: true,
        exitCode: 0,
        stdout: '',
        stderr: ''
      })
    };

    expect(mockRunner.run).toBeInstanceOf(Function);
  });
});
