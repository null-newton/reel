// Starts Node.js (nodejs-mobile) inside the app and sends its stdout/stderr to logcat.
#include <jni.h>
#include <android/log.h>
#include <pthread.h>
#include <unistd.h>

#include <cstring>
#include <string>
#include <vector>

#include "node.h"

namespace {

const char* kTag = "ReelNode";
int pipe_stdout[2];
int pipe_stderr[2];
pthread_t thread_stdout;
pthread_t thread_stderr;

void* forward(int fd, int priority) {
    char buf[2048];
    ssize_t n;
    while ((n = read(fd, buf, sizeof buf - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(priority, kTag, buf);
    }
    return nullptr;
}

void* forward_stdout(void*) { return forward(pipe_stdout[0], ANDROID_LOG_INFO); }
void* forward_stderr(void*) { return forward(pipe_stderr[0], ANDROID_LOG_ERROR); }

void redirect_output() {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    pipe(pipe_stdout);
    pipe(pipe_stderr);
    dup2(pipe_stdout[1], STDOUT_FILENO);
    dup2(pipe_stderr[1], STDERR_FILENO);
    pthread_create(&thread_stdout, nullptr, forward_stdout, nullptr);
    pthread_create(&thread_stderr, nullptr, forward_stderr, nullptr);
    pthread_detach(thread_stdout);
    pthread_detach(thread_stderr);
}

}  // namespace

extern "C" JNIEXPORT jint JNICALL
Java_app_reel_tv_NodeRuntime_startNode(JNIEnv* env, jobject /* this */, jobjectArray arguments) {
    // node::Start expects argv strings laid out contiguously in one buffer
    const jsize count = env->GetArrayLength(arguments);
    std::vector<std::string> args;
    size_t total = 0;
    for (jsize i = 0; i < count; i++) {
        auto js = static_cast<jstring>(env->GetObjectArrayElement(arguments, i));
        const char* chars = env->GetStringUTFChars(js, nullptr);
        args.emplace_back(chars);
        total += args.back().size() + 1;
        env->ReleaseStringUTFChars(js, chars);
        env->DeleteLocalRef(js);
    }
    char* buffer = static_cast<char*>(calloc(total, 1));
    std::vector<char*> argv;
    char* cursor = buffer;
    for (const auto& a : args) {
        memcpy(cursor, a.c_str(), a.size());
        argv.push_back(cursor);
        cursor += a.size() + 1;
    }

    redirect_output();
    return static_cast<jint>(node::Start(static_cast<int>(argv.size()), argv.data()));
}
