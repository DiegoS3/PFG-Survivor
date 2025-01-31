import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import firebase from 'firebase/app';
import 'firebase/firestore';
import { environment } from 'src/environments/environment';
import * as _ from "lodash";
import { AngularFireStorage } from '@angular/fire/storage';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  msgEnviar = ''; // Variable ngmodel de enviar mensaje !!!Cambiar

  userAuth: any | null; // Usuario guardado en session storage para obtener bien los datos al recargar la pagina
  friends = []; // Lista de amigos
  messagesFriends = []; // Array de mensajes de tus amigos
  messagesWithFriend = []; // Array de mensajes de amigos ya convertidos: mensajes que se van mostrando en cada chat
  uidFriendSelected = ''; // Amigo seleccionado al cambiar de chat
  chatEnabled = false; // Se activa cuando se pulsa un chat, permite ver los mensajes
  listeningSnapsMessages = []; // Array que contiene los escuchas de los amigos para poder desactivarlos al cerrar
  messagesWithoutRead = []; // Mensajes de cada chat sin leer
  gotAllMessages: boolean = false; // Comprueba si ya se han obtenido todos los mensajes (sin leer) al recargar la página 
  friendSelected: any;
  urlImg: any;

  constructor(
    private router: Router,
    public firestorage: AngularFireStorage) {
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  getUser() {
    this.userAuth = localStorage.getItem(environment.SESSION_KEY_USER_AUTH);
    this.userAuth = JSON.parse(this.userAuth);
  }

  /**
   * Suena mensaje dependiendo del tipo
   * @param type 1: mensaje sin leer / 2: borrar mensaje
   * 
   */
  sonidito(type: number) {
    if (type == 1) {
      var audio = new Audio('../../assets/tonos/tono-mensaje.mp3');
    } else if (type == 2) {
      var audio = new Audio('../../assets/tonos/tono-delete.mp3');
    } else if (type == 3) {
      var audio = new Audio('../../assets/tonos/tono-delete-chat.mp3');
    }
    audio.play();
  }
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~GET FRIENDS~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * Cargar amigos
   * @param login True: viene de login // False: recargar página
   */
  getFriends(login: boolean) {
    console.log('Obteniendo amigos...');

    this.friends = [];
    this.getUser();

    var query = firebase.firestore()
      .collection('users').doc(this.userAuth.uid).collection('friends')

    query.onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
        } else {
          const friend = {
            'uid': change.doc.id,
            'displayName': change.doc.data().displayName,
            'photoURL': change.doc.data().photoURL,
            'email': change.doc.data().email,
          }
          this.friends.push(friend);
        }
      });

      // console.log('Amigos:', this.friends);
      // Ir a poner en escucha los mensajes de sus amigos
      this.listenFriendMessages(login);
    });

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~LISTEN FRIEND MESSAGES~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * Pone en escucha los mensajes de todos los amigos
   * para recibir en tiempo real cualquier cambio
   * @param login 
   */
  listenFriendMessages(login: boolean) {
    var db = firebase.firestore();

    this.messagesFriends = [];
    this.messagesWithoutRead = [];
    var msgs = [];
    var msg: any;
    var readMessage = true;

    if (this.friends.length > 0) {
      this.friends.forEach((friend, index) => {
        // console.log('Recorriendo amigos para recibir sus mensajes...');
        msgs = [];
        this.getUser();

        var query = firebase.firestore()
          .collection('users').doc(this.userAuth.uid).collection('friends')
          .doc(friend.uid).collection('messages')
          .orderBy('timestamp', 'asc')

        var unsubscribe = query.onSnapshot(snapshot => {
          snapshot.docChanges().forEach(change => {
            // Mensaje eliminado
            if (change.type === 'removed') {
              readMessage = false;
              this.messagesFriends.forEach(user => {
                if (user.uid == friend.uid) {
                  user.messages.forEach((message, index) => {
                    if (message.id == change.doc.id) {
                      console.log('Mensaje borrado: ', message.id);
                      user.messages.splice(index, 1);
                      // Si todavía no está leido -> Descontar uno del contador de mensajes sin leer
                      if (message.isRead == false && message.displayName == friend.displayName) {
                        this.messagesWithoutRead.forEach(msg => {
                          if (msg.uid == friend.uid) {
                            var n = msg.messages - 1;
                            msg.messages = n;
                          }
                        });
                      }
                    }
                  });
                }
              });
            }
            // Mensaje actualizado (marcado como leído)
            else if (change.type === 'modified') {
              console.log('Actualizando leido');
              readMessage = false;
              this.messagesFriends.forEach(user => {
                if (user.uid == this.uidFriendSelected) { //friend.uid alternativa
                  user.messages.forEach(message => {
                    if (message.id == change.doc.id) {
                      console.log('Mensaje actualizado: ', message.id);
                      message.isRead = true;
                    }
                  });
                }
              });
            }
            // Mensaje añadido/recibido
            else {
              readMessage = true;
              var h = '';
              h += change.doc.data().timestamp.toDate();
              // var year = h.substring(11, 15);

              const message = {
                'id': change.doc.id,
                'displayName': change.doc.data().displayName,
                'text': change.doc.data().text,
                'imageURL': change.doc.data().imageURL,
                'isRead': change.doc.data().isRead,
                'photoURL': change.doc.data().photoURL,
                'storageRef': change.doc.data().storageRef,
                'timestamp': h.substring(16, 21),
                'day': h.substring(8, 11) + h.substring(4, 7)
              }
              msgs.push(message);
              msg = message;
            }
          });

          // Sólo realizar cuando se leen los mensajes o se añade nuevo mensaje
          if (readMessage) {
            var encontrado = false;
            if (this.messagesFriends.length > 0) {
              this.messagesFriends.forEach(user => {
                // Cargar un solo mensaje al enviar o recibir
                if (user.uid == friend.uid || user.uid == this.userAuth.uid) {
                  encontrado = true;
                  // console.log(user.messages);
                  user.messages[user.messages.length] = msg;
                  // Comprobar el chat que tengo abierto
                  db.collection("users").doc(this.userAuth.uid).get()
                    .then((doc) => {
                      // En caso de no tener el chat abierto añadimos un mensaje más sin leer
                      if (doc.data().chatOpen != friend.uid) {
                        if (msg.displayName == friend.displayName && msg.isRead == false) {
                          this.messagesWithoutRead.forEach(msg => {
                            if (msg.uid == friend.uid) {
                              var n = msg.messages + 1;
                              msg.messages = n;
                            }
                          });
                          console.log('Mensajes sin leer:', this.messagesWithoutRead);
                          this.sonidito(1);
                        }
                      }
                    });
                }
              });
            }
            // Cargar mensajes inicialmente
            if (!encontrado) {
              this.messagesFriends.push({ 'uid': friend.uid, 'messages': msgs });
              // Recorro los mensajes en busca de aquellos que tengan mi nombre y que el atributo read sea false
              var cont = 0;
              msgs.forEach(msg => {
                if (msg.displayName == friend.displayName && msg.isRead == false) {
                  // console.log('mensaje sin leer: ', friend.uid, msg.id);
                  cont++;
                }
              });
              this.messagesWithoutRead.push({ 'uid': friend.uid, 'messages': cont });
              console.log('Mensajes sin leer:', this.messagesWithoutRead);
            }
            msgs = [];
          }

          console.log('Lista mensajes amigos', this.messagesFriends);
          // Ha terminado de obtener los mensajes
          if (this.friends.length - 1 == index && this.gotAllMessages == false) {
            this.gotAllMessages = true;
            console.log('termine'); // !!!!
          }

        });

        // Añadir al array para poder dejar de escuchar al cerrar sesión y q al volver a entrar no vuelva 
        // a escuchar y x lo tanto haya duplicidad de mensajes
        this.listeningSnapsMessages.push(unsubscribe);

        // Es necesario q esté aquí para q sólo se desplaze al login cuando haya terminado de obtenerlos???
        if (login == true) {
          // Redirigiendo perfil...
          this.router.navigate(['perfil']);
        }
      });

    } else {
      if (login == true) {
        // Redirigiendo perfil... Sin amigos
        this.router.navigate(['perfil']);
      }
    }

  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~CHAT WITH FRIEND~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * Abrir mensajes de un chat con amigo
   * En caso de que los mensajes no estén leídos los marca como leidos
   * @param friend amigo seleccionado
   */
  chatWith(friend: any) {    
    if (friend.uid == this.uidFriendSelected) {
      return;
    }

    var db = firebase.firestore();

    this.messagesWithFriend = [];
    this.uidFriendSelected = friend.uid;
    this.friendSelected = friend;

    this.messagesFriends.forEach(user => {
      if (user.uid == friend.uid) {
        this.messagesWithFriend = user.messages;
        console.log('Mensajes del chat abierto: ', this.messagesWithFriend);

        // Guardar el chat q esta abierto para desps poder marcar como leído un mensaje si tengo el chat abierto
        db.collection("users").doc(this.userAuth.uid).update({
          chatOpen: user.uid,
        });

        // Poner en leído los mensajes del chat correspondiente
        this.messagesWithFriend.forEach(msg => {
          if (msg.displayName != this.userAuth.displayName && msg.isRead == false) {
            // Pongo en leido sus mensajes en su cuenta
            db.collection('users').doc(this.uidFriendSelected).collection('friends')
              .doc(this.userAuth.uid).collection('messages').doc(msg.id).update({
                isRead: true,
              });
            // Pongo en leído sus mensajes en mi cuenta
            db.collection('users').doc(this.userAuth.uid).collection('friends')
              .doc(this.uidFriendSelected).collection('messages').doc(msg.id).update({
                isRead: true,
              });

            msg.isRead = true;
          }
        });
        // Marcar en leído también en el array que te notifica cuantos te faltan x leer
        this.messagesWithoutRead.forEach(msg => {
          if (msg.uid == user.uid) {
            msg.messages = 0;
          }
        });

      }
    });
    this.chatEnabled = true;
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~SEND MESSAGE TO FRIEND~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * Enviar mensaje al amigo cuyo chat tienes abierto
   */
  sendMessageFriend() {
    var db = firebase.firestore();
    var msg = this.msgEnviar;

    // Insertar en mis amigos/mensajes
    db.collection('users').doc(this.userAuth.uid).collection('friends')
      .doc(this.uidFriendSelected).collection('messages').add({
        displayName: this.userAuth.displayName,
        text: this.msgEnviar,
        photoURL: this.userAuth.photoURL,
        isRead: false,
        timestamp: firebase.firestore.Timestamp.now(),

      })
      .then(ok => {
        // console.log('Añadido en mis mensajes');
        this.msgEnviar = '';
        // Una vez añadido en mis mensajes, se añadirá en los suyos para poder insertar el mismo uid en ambos sitios, esto nos servirá 
        // a la hora de eliminar mensajes en ambos chats

        //Insertar en sus amigos/mensajes
        db.collection('users').doc(this.uidFriendSelected).collection('friends')
          .doc(this.userAuth.uid).collection('messages').doc(ok.id).set({
            displayName: this.userAuth.displayName,
            text: msg,
            photoURL: this.userAuth.photoURL,
            isRead: false,
            timestamp: firebase.firestore.Timestamp.now(),
          })
          .then(okk => {
            // Comprobar si el usuario receptor tiene tu chat abierto, en ese caso actualizar como leído
            db.collection("users").doc(this.uidFriendSelected).get()
              .then((doc) => {
                if (doc.data().chatOpen == this.userAuth.uid) {
                  // Pongo en leido sus mensajes en su cuenta
                  db.collection('users').doc(this.uidFriendSelected).collection('friends')
                    .doc(this.userAuth.uid).collection('messages').doc(ok.id).update({
                      isRead: true,
                    })
                  // Pongo en leído sus mensajes en mi cuenta
                  db.collection('users').doc(this.userAuth.uid).collection('friends')
                    .doc(this.uidFriendSelected).collection('messages').doc(ok.id).update({
                      isRead: true,
                    })
                }
              });
          });
      });
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~SEND IMAGE~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * Enviar imágen en un chat
   * @param event 
   */
  sendImg(event) {
    var db = firebase.firestore();
    var file = event.target.files[0];
    var az = Math.floor(Math.random() * 100000000);
    var filePath1 = 'images/' + this.userAuth.uid + '/' + this.uidFriendSelected + '/' + az;
    var filePath2 = 'images/' + this.uidFriendSelected + '/' + this.userAuth.uid + '/' + az;

    this.firestorage.ref(filePath1).put(file).then(fileSnapshot => {
      return fileSnapshot.ref.getDownloadURL()
        .then(url => {
          console.log('Foto subida', url);

          db.collection('users').doc(this.userAuth.uid).collection('friends')
            .doc(this.uidFriendSelected).collection('messages').add({
              displayName: this.userAuth.displayName,
              imageURL: url,
              photoURL: this.userAuth.photoURL,
              isRead: false,
              storageRef: az,
              timestamp: firebase.firestore.Timestamp.now(),
            }).then(messageRef => {

              this.firestorage.ref(filePath2).put(file).then(fileSnapshot => {
                return fileSnapshot.ref.getDownloadURL()
                  .then(url => {
                    db.collection('users').doc(this.uidFriendSelected).collection('friends')
                      .doc(this.userAuth.uid).collection('messages').doc(messageRef.id).set({
                        displayName: this.userAuth.displayName,
                        imageURL: url,
                        photoURL: this.userAuth.photoURL,
                        isRead: false,
                        storageRef: az,
                        timestamp: firebase.firestore.Timestamp.now(),
                      })
                      .then(okk => {
                        // Comprobar si el usuario receptor tiene tu chat abierto, en ese caso actualizar como leído
                        db.collection("users").doc(this.uidFriendSelected).get()
                          .then((doc) => {
                            if (doc.data().chatOpen == this.userAuth.uid) {
                              // Pongo en leido sus mensajes en su cuenta
                              db.collection('users').doc(this.uidFriendSelected).collection('friends')
                                .doc(this.userAuth.uid).collection('messages').doc(messageRef.id).update({
                                  isRead: true,
                                })
                              // Pongo en leído sus mensajes en mi cuenta
                              db.collection('users').doc(this.userAuth.uid).collection('friends')
                                .doc(this.uidFriendSelected).collection('messages').doc(messageRef.id).update({
                                  isRead: true,
                                })
                            }
                          });
                      });
                  });
              });
            });
        });
    });
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DELETE MESSAGE~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * Elimina un mensaje
   * @param message mensaje seleccionado para borrar
   * @param type 1: eliminar para mi // 2: eliminar para todos
   */
  deleteMsgs(message: any, type: number) {
    this.sonidito(2);
    console.log(message.storageRef);

    var db = firebase.firestore();

    db.collection('users').doc(this.userAuth.uid).collection('friends')
      .doc(this.uidFriendSelected).collection('messages').doc(message.id).delete()
      // Comprobar si tiene foto asociada y en ese caso eliminarla
      .then(ok => {
        if (message.storageRef) {
          var path = 'images/' + this.userAuth.uid + '/' + this.uidFriendSelected + '/' + message.storageRef;
          this.firestorage.ref(path).delete();
        }
      });

    // Eliminar para todos
    if (type == 2) {
      db.collection('users').doc(this.uidFriendSelected).collection('friends')
        .doc(this.userAuth.uid).collection('messages').doc(message.id).delete()
        .then(ok => {
          if (message.storageRef) {
            var path = 'images/' + this.uidFriendSelected + '/' + this.userAuth.uid + '/' + message.storageRef;
            this.firestorage.ref(path).delete();
          }
        });
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~CLOSE CHAT~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * Cierra el chat abierto
   */
  closeChat() {
    var db = firebase.firestore();

    this.uidFriendSelected = '';
    this.chatEnabled = false;

    db.collection("users").doc(this.userAuth.uid).update({
      chatOpen: '',
    }).then(() => {
      // console.log("Document successfully written!");
    }).catch((error) => {
      console.error("Error writing document: ", error);
    });
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~STOP LISTENING FRIEND MESSAGES~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
  * Parar escucha de los mensajes del amigo
  * Este método se llama al cerrar sesión
  */
  stopListenFriendMessages() {
    console.log('Parando escucha mensajes amigos...');
    // Recorrer todos los mensajes en escucha y eliminarlos
    this.listeningSnapsMessages.forEach(unsubscribe => {
      console.log('Desactivando...');
      unsubscribe();
    });
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~DELETE CHAT~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  /**
   * Elimina los mensajes del chat seleccionado
   */
  deleteChat() {
    this.sonidito(3);
    var db = firebase.firestore();
    var query = db.collection("users").doc(this.userAuth.uid).collection('friends').doc(this.uidFriendSelected).collection('messages');
    query.get()
      .then((doc) => {
        doc.forEach(change => {
          query.doc(change.id).delete();
        });
      });
  }

}
