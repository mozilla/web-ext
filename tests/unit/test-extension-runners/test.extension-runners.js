/* @flow */

import {describe, it} from 'mocha';
import {assert} from 'chai';
import sinon from 'sinon';

import {
  MultipleTargetsExtensionRunner,
} from '../../../src/extension-runners';
import {
  FakeExtensionRunner,
  getFakeFirefox,
  getFakeRemoteFirefox,
} from '../helpers';

function prepareExtensionRunnerParams(params) {
  return {
    runners: [new FakeExtensionRunner(), new FakeExtensionRunner()],
    firefoxApp: getFakeFirefox(),
    firefoxClient: () => {
      return Promise.resolve(getFakeRemoteFirefox());
    },
    ...params,
  };
}

describe('util/extension-runners', () => {

  it('calls the "run" method on all the created IExtensionRunner', async () => {
    const params = prepareExtensionRunnerParams();
    const [
      fakeExtensionRunner, anotherFakeExtensionRunner,
    ] = params.runners;

    sinon.spy(fakeExtensionRunner, 'run');
    sinon.spy(anotherFakeExtensionRunner, 'run');

    const runnerInstance = new MultipleTargetsExtensionRunner(params);

    await runnerInstance.run();

    assert.ok(fakeExtensionRunner.run.calledOnce);
    assert.ok(anotherFakeExtensionRunner.run.calledOnce);
  });

  it('calls the "reloadAllExtensions" on all the created runners',
     async () => {
       const params = prepareExtensionRunnerParams();
       const [
         fakeExtensionRunner, anotherFakeExtensionRunner,
       ] = params.runners;

       sinon.spy(fakeExtensionRunner, 'reloadAllExtensions');
       sinon.spy(anotherFakeExtensionRunner, 'reloadAllExtensions');

       const runnerInstance = new MultipleTargetsExtensionRunner(params);

       await runnerInstance.reloadAllExtensions();

       assert.ok(fakeExtensionRunner.reloadAllExtensions.calledOnce);
       assert.ok(anotherFakeExtensionRunner.reloadAllExtensions.calledOnce);
     });

  it('calls the "reloadExtensionBySourceDir" on all the created runners',
     async () => {
       const params = prepareExtensionRunnerParams();
       const [
         fakeExtensionRunner, anotherFakeExtensionRunner,
       ] = params.runners;

       sinon.spy(fakeExtensionRunner, 'reloadExtensionBySourceDir');
       sinon.spy(anotherFakeExtensionRunner, 'reloadExtensionBySourceDir');

       const runnerInstance = new MultipleTargetsExtensionRunner(params);

       await runnerInstance.reloadExtensionBySourceDir(
         '/fake/source/dir'
       );

       assert.ok(fakeExtensionRunner.reloadExtensionBySourceDir.calledOnce);
       assert.ok(
         anotherFakeExtensionRunner.reloadExtensionBySourceDir.calledOnce
       );

       assert.equal(
         fakeExtensionRunner.reloadExtensionBySourceDir.firstCall.args[0],
         '/fake/source/dir'
       );
       assert.equal(
         anotherFakeExtensionRunner.reloadExtensionBySourceDir
           .firstCall.args[0],
         '/fake/source/dir'
       );
     });

  it('calls exit on all the created IExtensionRunner', async () => {
    const params = prepareExtensionRunnerParams();
    const [
      fakeExtensionRunner, anotherFakeExtensionRunner,
    ] = params.runners;

    sinon.spy(fakeExtensionRunner, 'exit');
    sinon.spy(anotherFakeExtensionRunner, 'exit');

    const runnerInstance = new MultipleTargetsExtensionRunner(params);

    await runnerInstance.exit();

    assert.ok(fakeExtensionRunner.exit.calledOnce);
    assert.ok(anotherFakeExtensionRunner.exit.calledOnce);
  });

  describe('registerCleanup', () => {

    it('calls its callbacks once all the runner callbacks have been called',
       async () => {
         const params = prepareExtensionRunnerParams();
         const [
           fakeExtensionRunner, anotherFakeExtensionRunner,
         ] = params.runners;

         sinon.spy(fakeExtensionRunner, 'registerCleanup');
         sinon.spy(anotherFakeExtensionRunner, 'registerCleanup');

         const runnerInstance = new MultipleTargetsExtensionRunner(params);

         const waitRegisterCleanup = new Promise((resolve) => {
           runnerInstance.registerCleanup(resolve);
         });

         assert.ok(fakeExtensionRunner.registerCleanup.calledOnce);
         assert.ok(anotherFakeExtensionRunner.registerCleanup.calledOnce);

         fakeExtensionRunner.registerCleanup.firstCall.args[0]();

         const checkIncompleteCleanup = await Promise.race([
           waitRegisterCleanup,
           new Promise((resolve) => {
             setTimeout(
               () => resolve('waitRegisterCleanup should not be resolved yet'),
               300
             );
           }),
         ]);

         assert.equal(checkIncompleteCleanup,
                      'waitRegisterCleanup should not be resolved yet');

         anotherFakeExtensionRunner.registerCleanup.firstCall.args[0]();

         await waitRegisterCleanup;
       });

  });

});
