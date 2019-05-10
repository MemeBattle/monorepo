import { flow, types } from 'mobx-state-tree'

export const Project = types.model({ id: types.number })

const projects = [{ id: 1 }, { id: 2 }]

const ProjectServices = {
  getProjects: () => new Promise(resolve => resolve(projects)),
}

export const ProjectsStore = types.model({ projects: types.array(Project) }).actions(self => ({
  loadTeam: flow(function*() {
    self.projects = yield ProjectServices.getProjects()
  }),
}))
